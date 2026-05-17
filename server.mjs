import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import createHandlers from "./app-handler.mjs";

const DEFAULT_PASSWORD = "1234";
const HOST = process.env.HOST || "0.0.0.0";
const START_PORT = Number(process.env.PORT || 3000);
const { handleRequest } = createHandlers();
const server = createServer(handleRequest);

export default server;

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
