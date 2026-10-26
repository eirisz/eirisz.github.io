// Google sends the sign-in answer here; it goes back to the Boo window that asked,
// over a channel shared by Boo's pages on this site (Google's pages cut window.opener).
const channel = new BroadcastChannel('boo-oauth');
channel.postMessage({ type: 'boo-oauth', search: location.search });
channel.close();
setTimeout(() => window.close(), 300);
