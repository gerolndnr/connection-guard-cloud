// www.connectionguard.net → connectionguard.net, permanently, keeping path and query.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = "connectionguard.net";
    return Response.redirect(url.toString(), 301);
  },
};
