chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type !== "download") return;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const url = `https://osu.direct/d/${msg.id}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");

    // Try header first, then fallback to the name sent from content.ts
    const disposition = response.headers.get('content-disposition');
    let filename = msg.fallbackName || `beatmapset-${msg.id}.osz`;
    
    if (disposition) {
      const filenameMatch = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^"';]+)['"]?/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Could not read response body");

    let received = 0;
    const chunks: Uint8Array[] = [];

    // Stream the data for real-time progress
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      chrome.tabs.sendMessage(tabId, {
        type: "progress",
        received,
        total,
        filename
      });
    }

    // Reassemble Binary Data
    const fullData = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      fullData.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to Base64 (Service Worker compatible)
    // We use a chunked approach to avoid "Maximum call stack size exceeded" on large files
    let binary = '';
    const bytes = new Uint8Array(fullData);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    const dataUrl = `data:application/x-osu-archive;base64,${base64Data}`;

    // Trigger Browser Download
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }, () => {
      chrome.tabs.sendMessage(tabId, { type: "complete", filename });
    });

  } catch (error) {
    console.error("Download Error:", error);
    chrome.tabs.sendMessage(tabId, { type: "failed" });
  }
  return true;
});