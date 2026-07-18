const form = RZ.el('repair-form');
const notice = RZ.el('notice');
const btn = RZ.el('submit-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.className = 'notice';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const body = {
    name: RZ.el('name').value,
    phone: RZ.el('phone').value,
    boothId: RZ.el('boothId').value,
    contact: RZ.el('contact').value,
    item: RZ.el('item').value,
    issue: RZ.el('issue').value,
    notes: RZ.el('notes').value,
    agreedTerms: RZ.el('agreedTerms').checked,
  };

  try {
    const data = await RZ.api('/api/repairs', { method: 'POST', body });
    form.style.display = 'none';
    RZ.el('success-title').textContent = `Request #${data.id} received!`;
    RZ.el('success-body').textContent =
      `Thanks, ${body.name.split(' ')[0] || 'friend'}! We've added "${body.item}" to the queue. ` +
      `Swing by the Repair Zone booth when you can — we'll take it from there.`;
    RZ.el('success-panel').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    RZ.notice(notice, 'error', err.message);
    btn.disabled = false;
    btn.textContent = 'Submit repair request';
  }
});
