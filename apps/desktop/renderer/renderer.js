if (window.distort) {
  document.querySelector('#version').textContent = window.distort.version();
  document.querySelectorAll('a[href="https://github.com/di6tort-bit/distort"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.distort.openRepository();
    });
  });
}
// No connection toggle is simulated; the UI remains explicitly not configured.
