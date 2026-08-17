/** Cloudflare Workers adapter for the shared Surfboard Composer handler. */
import { handleRequest } from "./handler.js";

export default {
  fetch: handleRequest,
};
