const form = RZ.el('borrow-form');
const notice = RZ.el('notice');
const btn = RZ.el('submit-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.className = 'notice';
  btn.disabled = true;
  btn.textContent = 'Checking out…';

  const body = {
    toolName: RZ.el('toolName').value,
    name: RZ.el('name').value,
    phone: RZ.el('phone').value,
    boothId: RZ.el('boothId').value,
    agreedTerms: RZ.el('agreedTerms').checked,
  };

  try {
    const data = await RZ.api('/api/rentals', { method: 'POST', body });
    form.style.display = 'none';
    RZ.el('success-title').textContent = `${data.rental.toolName} — checked out`;
    RZ.el('success-body').textContent =
      `Logged at ${RZ.time(data.rental.timeOut)}. Please return it to the Repair Zone booth by end of day, clean and working. Thanks!`;
    RZ.el('success-panel').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    RZ.notice(notice, 'error', err.message);
    btn.disabled = false;
    btn.textContent = 'Check out this tool';
  }
});
