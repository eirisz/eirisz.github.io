// Google sends the sign-in answer here; it goes back to the Boo window that asked.
if (window.opener) {
  window.opener.postMessage({ type: 'boo-oauth', search: location.search }, location.origin);
  window.close();
}
