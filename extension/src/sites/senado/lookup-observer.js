(function () {
  "use strict";
  var $ = window.jQuery;
  if (!$) return;
  var requests = new WeakMap();
  var counter = 0;
  function notify(phase, id, ok) {
    window.postMessage({ source: "asistente-lobby-senado-lookup", phase: phase, id: id, ok: ok }, window.location.origin);
  }
  $(document).ajaxSend(function (event, xhr, settings) {
    var url;
    try { url = new URL(settings.url, window.location.href); } catch (error) { return; }
    if (url.origin !== window.location.origin || !url.pathname.endsWith("/forms/procesos/buscaPersonaForms.php")) return;
    var id = ++counter;
    requests.set(xhr, id);
    notify("start", id, null);
  });
  $(document).ajaxComplete(function (event, xhr) {
    var id = requests.get(xhr);
    if (!id) return;
    requests.delete(xhr);
    notify("complete", id, xhr.status >= 200 && xhr.status < 300);
  });
  notify("ready", 0, true);
}());
