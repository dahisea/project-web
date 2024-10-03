addEventListener('fetch', (event) => event.respondWith(handleRequest(event.request)));

async function handleRequest(request) {
  const originalRequestUrl = new URL(request.url);
  const originalUrl = originalRequestUrl.href.replace(`${originalRequestUrl.origin}/p/`, "");
  const baseUrl = `https://${originalRequestUrl.host}/p/`;

  const modifiedHeaders = new Headers(request.headers);
  ['Referer', 'cf-cert-presented', 'cf-cert-revoked', 'cf-cert-verified',
   'cf-connecting-ip', 'cf-ipcontinent', 'cf-ipcountry', 'cf-iplatitude',
   'cf-iplongitude', 'cf-ray', 'cf-timezone', 'cf-visitor'].forEach(header => modifiedHeaders.delete(header));

  let originalResponse = await fetch(new Request(originalUrl, {
    method: request.method,
    headers: modifiedHeaders,
    body: request.body,
    redirect: 'manual'
  }));

  // 处理 3xx 重定向
  while (originalResponse.status >= 300 && originalResponse.status < 400) {
    const location = originalResponse.headers.get('Location');
    if (!location) break;
    originalResponse = await fetch(new Request(new URL(location, originalRequestUrl.origin).href, {
      method: request.method,
      headers: modifiedHeaders,
      body: request.body,
      redirect: 'follow'
    }));
  }

  if (originalResponse.ok && /text\/html|application\/javascript/.test(originalResponse.headers.get('Content-Type'))) {
    let responseBody = await originalResponse.text();

    const replaceAttributes = (html) => html
      .replace(/[(](https?:\/\/[^"]*?[^"]*)[)]/g, (_, p1) => `(${baseUrl}${p1})`)
      .replace(/"(https?:\/\/[^"]*?[^"]*)"/g, (_, p1) => `"${baseUrl}${p1}"`)
      .replace(/(src|href|content|action|data-[^=]+)="(\/\/[^"]+)"/g, (_, p1, p2) => `${p1}="${originalRequestUrl.protocol}${p2}"`)
      .replace(/(src|href|content|action|data-[^=]+)="(\/[^"]+)"/g, (_, p1, p2) => `${p1}="${baseUrl}${new URL(p2, originalUrl).href}"`)
      .replace(/"(?!(javascript:))([^"]*)"/g, (match) => match.replace(/(^|[^:])\/\/(.*)/, `$1${originalRequestUrl.protocol}$2`)); // 处理开头的链接，排除 JavaScript 链接

    responseBody = replaceAttributes(responseBody);

    return new Response(responseBody, {
      headers: originalResponse.headers,
      status: originalResponse.status,
      statusText: originalResponse.statusText
    });
  }

  return originalResponse; // 返回原始响应
}
