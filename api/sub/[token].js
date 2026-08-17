import { handleRequest } from "../../src/handler.js";

export const config = {
  runtime: "edge",
};

export default function vercelHandler(request) {
  return handleRequest(request, {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN,
    SUBSCRIPTION_URL: process.env.SUBSCRIPTION_URL,
    PASSWORD_FILTER: process.env.PASSWORD_FILTER,
  });
}
