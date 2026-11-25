const softwareSection = document.getElementById('receiverSoftware');
const companies = softwareSection.querySelector('.software-redirect-only');
const viewer = softwareSection.querySelector('.software-viewer');
const companyName = viewer.querySelector('.software-viewer-name');
const officialLink = viewer.querySelector('.software-viewer-official');
const back = viewer.querySelector('.software-viewer-back');
const frame = viewer.querySelector('iframe');
let selectedCompany;

companies.addEventListener('click', (event) => {
  const company = event.target.closest('[data-software-company]');
  if (!company || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  selectedCompany = company;
  companyName.textContent = company.dataset.softwareCompany;
  officialLink.href = company.href;
  companies.hidden = true;
  viewer.hidden = false;
  frame.src = company.href;
  back.focus();
});

back.addEventListener('click', () => {
  viewer.hidden = true;
  frame.removeAttribute('src');
  officialLink.removeAttribute('href');
  companies.hidden = false;
  selectedCompany.focus();
});
