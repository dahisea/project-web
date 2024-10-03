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
      // 保持javascript:链接原样
      .replace(/"(javascript:[^"<>]*)"/g, (match) => match)
      // 替换绝对链接 (http 开头的链接)
      .replace(/[(](https?:\/\/[^"<>]*?[^"<>]*)[)]/g, (_, p1) => `(${baseUrl}${p1})`)
      .replace(/"(https?:\/\/[^"<>]*?[^"<>]*)"/g, (_, p1) => `"${baseUrl}${p1}"`)
      // 替换双斜杠开头的协议相对路径
      .replace(/"(\/\/[^"<>]+)"/g, (_, p1) => `"${baseUrl}${originalRequestUrl.protocol}${p1}"`)
      // 替换以 / 开头的相对路径
      .replace(/"(\/[^"<>]+)"/g, (_, p1) => `"${baseUrl}${new URL(p1, originalUrl).href}"`);

    responseBody = replaceAttributes(responseBody);

    return new Response(responseBody, {
      headers: originalResponse.headers,
      status: originalResponse.status,
      statusText: originalResponse.statusText
    });
  }

  return originalResponse;
}
