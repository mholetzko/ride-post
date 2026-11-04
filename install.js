let pendingInstall;
const dialog = document.getElementById('install-dialog');
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstall = event; });
document.getElementById('install-app').addEventListener('click', async () => {
  if (pendingInstall) { const prompt = pendingInstall; pendingInstall = null; await prompt.prompt(); }
  else dialog.showModal();
});
document.getElementById('install-close').addEventListener('click', () => dialog.close());
document.getElementById('install-ok').addEventListener('click', () => dialog.close());
