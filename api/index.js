import createHandlers from "../app-handler.mjs";

const { handleWebRequest } = createHandlers();

export default {
  fetch(request) {
    return handleWebRequest(request);
  }
};
