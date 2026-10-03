import app from "./worker.js";

const SHORT_TOKEN_PATH = /^\/[A-Za-z0-9_-]{16,80}$/;

function rewriteRequestPath(request, pathname){
  const url=new URL(request.url);
  url.pathname=pathname;
  return new Request(url,request);
}

function maybeShortenCustomerLinks(request,response){
  const type=response.headers.get("content-type")||"";
  if(!type.includes("application/json"))return response;
  return (async()=>{
    const origin=new URL(request.url).origin;
    const text=await response.text();
    const body=text.split(`${origin}/trip/`).join(`${origin}/`);
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  })();
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==="GET"&&SHORT_TOKEN_PATH.test(url.pathname)){
      const token=url.pathname.slice(1);
      return app.fetch(rewriteRequestPath(request,`/trip/${token}`),env,ctx);
    }
    const response=await app.fetch(request,env,ctx);
    return await maybeShortenCustomerLinks(request,response);
  }
};
