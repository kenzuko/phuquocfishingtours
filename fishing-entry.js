import app from "./fishing-worker.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      const internal = new URL(request.url);
      internal.pathname = "/fishing";
      const rewritten = new Request(internal, request);
      return app.fetch(rewritten, env, ctx);
    }
    return app.fetch(request, env, ctx);
  }
};
