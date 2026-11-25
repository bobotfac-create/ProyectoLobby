// Agregar solo las URL completas de las versiones de extension autorizadas.
window.LOBBY_EXTENSION_REDIRECTS = Object.freeze([
  "https://jjicnjpjjpcekmpccejamkookcfdcbkb.chromiumapp.org/firebase",
  "https://396d7498a622f947e55eef3fa34c4ac03f06cdb6.extensions.allizom.org/firebase"
]);

window.isAllowedLobbyExtensionRedirect = function (value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      window.LOBBY_EXTENSION_REDIRECTS.includes(url.href);
  } catch (error) {
    return false;
  }
};
