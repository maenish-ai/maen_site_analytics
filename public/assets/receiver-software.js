const softwareSection = document.getElementById('receiverSoftware');
const companies = softwareSection.querySelector('.software-redirect-only');
const viewer = softwareSection.querySelector('.software-viewer');
const back = viewer.querySelector('.software-viewer-back');
const frame = viewer.querySelector('iframe');
let selectedCompany;

companies.addEventListener('click', (event) => {
  const company = event.target.closest('[data-software-company]');
  if (!company || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  selectedCompany = company;
  frame.src = company.href;
  viewer.showModal();
});

back.addEventListener('click', () => viewer.close());

viewer.addEventListener('close', () => {
  frame.removeAttribute('src');
  selectedCompany?.focus({ preventScroll: true });
});
