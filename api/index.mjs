import { handleRequest, handleWebRequest } from "../server.mjs";

async function handler(request, response) {
  if (response && typeof response.writeHead === "function") {
    return handleRequest(request, response);
  }

  return handleWebRequest(request);
}

handler.fetch = handleWebRequest;

export function GET(request) {
  return handleWebRequest(request);
}

export function POST(request) {
  return handleWebRequest(request);
}

export default handler;
