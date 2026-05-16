import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { buildShippingList, createShippingWorkbook, parseDateRange } from "./shipping-core.mjs";

const DEFAULT_PASSWORD = "1234";
const PASSWORD = process.env.SHIPPING_LIST_PASSWORD || DEFAULT_PASSWORD;
const SESSION_SECRET = process.env.SHIPPING_LIST_SESSION_SECRET || PASSWORD;
const SESSION_COOKIE = "shipping_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const HOST = process.env.HOST || "0.0.0.0";
const START_PORT = Number(process.env.PORT || 3000);

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    applyRoutedPath(url);

    if (request.method === "GET" && url.pathname === "/") {
      return sendHtml(response, renderPage({ authenticated: isAuthenticated(request), loginError: url.searchParams.get("error") === "1" }));
    }

    if (request.method === "POST" && url.pathname === "/login") {
      return handleLogin(request, response);
    }

    if (request.method === "GET" && url.pathname === "/logout") {
      response.writeHead(302, {
        "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
        Location: "/"
      });
      return response.end();
    }

    if (request.method === "GET" && url.pathname === "/app.css") {
      return serveStatic(response, "public/app.css");
    }

    if (request.method === "GET" && url.pathname === "/app.js") {
      return serveStatic(response, "public/app.js");
    }

    if (url.pathname.startsWith("/api/") && !isAuthenticated(request)) {
      return sendJson(response, 401, { error: "로그인이 필요합니다." });
    }

    if (request.method === "GET" && url.pathname === "/api/preview") {
      return handlePreview(url, response);
    }

    if (request.method === "GET" && url.pathname === "/download") {
      if (!isAuthenticated(request)) {
        response.writeHead(302, { Location: "/" });
        return response.end();
      }
      return handleDownload(url, response);
    }

    sendText(response, 404, "페이지를 찾을 수 없습니다.");
  } catch (error) {
    sendText(response, 500, error.message || "서버 오류가 발생했습니다.");
  }
}

const server = createServer(handleRequest);

export async function handleWebRequest(request) {
  const requestUrl = new URL(request.url);
  applyRoutedPath(requestUrl);

  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  const nodeRequest = {
    method: request.method,
    url: `${requestUrl.pathname}${requestUrl.search}`,
    headers: Object.fromEntries(request.headers.entries()),
    async *[Symbol.asyncIterator]() {
      if (bodyBuffer.length > 0) {
        yield bodyBuffer;
      }
    }
  };
  const nodeResponse = createWebResponseAdapter();
  await handleRequest(nodeRequest, nodeResponse);
  return nodeResponse.toResponse();
}

function applyRoutedPath(url) {
  const routedPath = url.searchParams.get("__path");
  if (routedPath) {
    url.pathname = routedPath;
    url.searchParams.delete("__path");
  }
}

async function handleLogin(request, response) {
  const body = await readBody(request);
  const params = new URLSearchParams(body);
  const password = params.get("password") || "";

  if (!safeEqual(password, PASSWORD)) {
    response.writeHead(302, { Location: "/?error=1" });
    return response.end();
  }

  const token = createSession();
  response.writeHead(302, {
    "Set-Cookie": cookieHeader(token),
    Location: "/"
  });
  response.end();
}

async function handlePreview(url, response) {
  try {
    const { startDate, endDate } = readDateRangeParam(url);
    const result = await buildShippingList(startDate, endDate);
    sendJson(response, 200, {
      date: result.date,
      targetSheetDate: result.targetSheetDate,
      selectedDateClosed: result.selectedDateClosed,
      selectedDateClosedReason: result.selectedDateClosedReason,
      sourceCount: result.sourceCount,
      duplicateCount: result.duplicateCount,
      outputCount: result.outputCount,
      columns: result.columns,
      rows: result.rows,
      filters: result.filters,
      summary: result.summary
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleDownload(url, response) {
  let result;
  try {
    const { startDate, endDate } = readDateRangeParam(url);
    result = await createShippingWorkbook(startDate, endDate, readListOptions(url));
  } catch (error) {
    return sendText(response, 400, error.message);
  }

  if (result.outputCount === 0) {
    return sendText(response, 404, `${result.targetSheetDate} 출고 데이터가 없습니다.`);
  }

  const fallbackName = result.isRange
    ? `shipping-list-${result.startDate}-${result.endDate}.xlsx`
    : `shipping-list-${result.date}.xlsx`;
  const encodedName = encodeURIComponent(result.fileName);
  response.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Length": result.buffer.length,
    "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "no-store"
  });
  response.end(result.buffer);
}

function readDateRangeParam(url) {
  const startDate = url.searchParams.get("startDate") || url.searchParams.get("date");
  const endDate = url.searchParams.get("endDate") || startDate;
  if (!startDate || !endDate) {
    throw new Error("기간을 선택해주세요.");
  }
  parseDateRange(startDate, endDate);
  return { startDate, endDate };
}

function readListOptions(url) {
  const sortKey = url.searchParams.get("sortKey") || "shippingDate";
  const sortDirection = url.searchParams.get("sortDirection") || "asc";
  return {
    shippingDates: url.searchParams.getAll("shippingDate"),
    itemCodes: url.searchParams.getAll("itemCode"),
    categories: url.searchParams.getAll("category"),
    shippingDate: url.searchParams.get("shippingDate") || "",
    itemCode: url.searchParams.get("itemCode") || "",
    category: url.searchParams.get("category") || "",
    itemSearch: url.searchParams.get("itemSearch") || "",
    styleSearch: url.searchParams.get("styleSearch") || "",
    sortKey,
    sortDirection
  };
}

function createSession() {
  const payload = `${Date.now() + SESSION_TTL_MS}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

function isAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtText, nonce, signature] = parts;
  const payload = `${expiresAtText}.${nonce}`;
  const expectedSignature = signSessionPayload(payload);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  if (expiresAt < Date.now()) {
    return false;
  }

  return true;
}

function signSessionPayload(payload) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

function parseCookies(cookieHeaderValue) {
  return Object.fromEntries(
    cookieHeaderValue
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) {
          return [part, ""];
        }
        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      })
  );
}

function cookieHeader(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 16) {
      throw new Error("요청이 너무 큽니다.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(response, filePath) {
  const body = await readFile(new URL(filePath, import.meta.url));
  response.writeHead(200, {
    "Content-Type": mimeType(filePath),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function createWebResponseAdapter() {
  const chunks = [];
  let status = 200;
  const headers = new Headers();

  return {
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      for (const [key, value] of Object.entries(nextHeaders)) {
        headers.set(key, String(value));
      }
    },
    end(body = "") {
      if (Buffer.isBuffer(body)) {
        chunks.push(body);
      } else if (body) {
        chunks.push(Buffer.from(String(body)));
      }
    },
    toResponse() {
      return new Response(chunks.length ? Buffer.concat(chunks) : null, {
        status,
        headers
      });
    }
  };
}

function mimeType(filePath) {
  return {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[extname(filePath)] || "application/octet-stream";
}

function renderPage({ authenticated, loginError }) {
  if (!authenticated) {
    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>출고리스트 생성기</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body class="login-page">
  <main class="login-panel" aria-labelledby="login-title">
    <p class="eyebrow">MIXXO</p>
    <h1 id="login-title">출고리스트 생성기</h1>
    <form class="login-form" action="/login" method="post">
      <label for="password">비밀번호</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      ${loginError ? '<p class="form-error">비밀번호가 맞지 않습니다.</p>' : ""}
      <button type="submit">로그인</button>
    </form>
  </main>
</body>
</html>`;
  }

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>출고리스트 생성기</title>
  <link rel="stylesheet" href="/app.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <header class="app-header">
    <div>
      <p class="eyebrow">MIXXO</p>
      <h1>출고리스트 생성기</h1>
    </div>
    <a class="logout-link" href="/logout">로그아웃</a>
  </header>

  <main class="app-shell">
    <section class="toolbar" aria-label="출고리스트 생성">
      <div class="field">
        <label for="start-date">시작일</label>
        <input id="start-date" type="date" data-testid="start-date-input">
      </div>
      <div class="field">
        <label for="end-date">종료일</label>
        <input id="end-date" type="date" data-testid="end-date-input">
      </div>
      <button id="refresh" class="secondary-button" type="button">새로고침</button>
      <button id="download" type="button" data-testid="download-button">엑셀 다운로드</button>
    </section>

    <section id="status" class="status" role="status" aria-live="polite"></section>

    <nav class="view-tabs" aria-label="페이지 보기">
      <button class="view-tab active" type="button" data-view="summary">요약</button>
      <button class="view-tab" type="button" data-view="detail">상세 리스트</button>
    </nav>

    <section id="summary-view" class="view-panel" aria-label="출고 리스트 요약">
      <div class="weekly-summary">
        <div class="section-title-row">
          <div>
            <h2>■ 출고 리스트 요약</h2>
            <p class="section-caption">원하는 주차를 선택하면 해당 주차의 화/수/목/금/월 출고 요약을 보여줍니다.</p>
          </div>
          <div id="capacity-alert" class="capacity-alert" hidden></div>
        </div>
        <div id="week-buttons" class="week-buttons" aria-label="주차 선택"></div>
        <div class="summary-table-wrap">
          <table class="summary-table">
            <thead id="weekly-summary-head"></thead>
            <tbody id="weekly-summary-body"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="detail-view" class="detail-section view-panel" aria-label="출고리스트 미리보기" hidden>
      <div class="section-title-row">
        <h2>상세 출고리스트</h2>
        <div id="detail-count" class="detail-count"></div>
      </div>
      <div class="detail-filters" aria-label="상세 리스트 필터">
        <div class="field">
          <label for="shipping-date-filter-button">출고일자</label>
          <div id="shipping-date-filter" class="multi-filter" data-testid="shipping-date-filter">
            <button id="shipping-date-filter-button" class="multi-filter-button" type="button" aria-haspopup="true" aria-expanded="false">전체 출고일자</button>
            <div id="shipping-date-filter-menu" class="multi-filter-menu" hidden></div>
          </div>
        </div>
        <div class="field">
          <label for="category-filter-button">구분</label>
          <div id="category-filter" class="multi-filter" data-testid="category-filter">
            <button id="category-filter-button" class="multi-filter-button" type="button" aria-haspopup="true" aria-expanded="false">전체 구분</button>
            <div id="category-filter-menu" class="multi-filter-menu" hidden></div>
          </div>
        </div>
        <div class="field">
          <label for="item-filter-button">아이템</label>
          <div id="item-filter" class="multi-filter" data-testid="item-filter">
            <button id="item-filter-button" class="multi-filter-button" type="button" aria-haspopup="true" aria-expanded="false">전체 아이템</button>
            <div id="item-filter-menu" class="multi-filter-menu" hidden></div>
          </div>
        </div>
        <div class="field">
          <label for="item-search">아이템 검색</label>
          <input id="item-search" type="search" placeholder="코드/대분류 검색" autocomplete="off">
        </div>
        <div class="field">
          <label for="style-search">스타일 코드 검색</label>
          <input id="style-search" type="search" placeholder="스타일 코드 검색" autocomplete="off">
        </div>
        <button id="clear-filters" class="secondary-button" type="button">필터 초기화</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr id="table-head"></tr>
          </thead>
          <tbody id="table-body"></tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function listenWithFallback() {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = START_PORT + offset;
    try {
      await listen(port);
      const url = `http://localhost:${port}`;
      console.log(`출고리스트 생성기 실행 중: ${url}`);
      if (!process.env.SHIPPING_LIST_PASSWORD) {
        console.log(`로컬 개발용 기본 비밀번호: ${DEFAULT_PASSWORD}`);
      }
      if (process.env.OPEN_BROWSER === "1") {
        openBrowser(url);
      }
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") {
        throw error;
      }
    }
  }

  throw new Error("사용 가능한 포트를 찾지 못했습니다.");
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  listenWithFallback().catch((error) => {
    console.error("서버를 시작하지 못했습니다.");
    console.error(error.message);
    process.exitCode = 1;
  });
}
