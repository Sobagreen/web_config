const POPUP_WIDTH = 1880;
const POPUP_HEIGHT = 900;

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true
  });
});
