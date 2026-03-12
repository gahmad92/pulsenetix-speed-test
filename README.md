# ◈ PulseNetix — Advanced Internet Speed Test

PulseNetix is a high-precision, Electron-based desktop application designed to provide more realistic network performance metrics than standard speed test sites. While many platforms show "boosted" speeds by ignoring network congestion, PulseNetix focuses on the actual quality of your connection under load.

## 🚀 Key Features

*   **Active Ping (Bufferbloat) Measurement:** Measures latency specifically while downloading and uploading. This reveals how your connection performs during heavy usage, identifying "Bufferbloat" that causes lag in gaming or video calls.
*   **Multi-Threaded Engine:** Utilizes parallel threads for both download and upload tests to saturate your connection and find its true peak capacity.
*   **Live Packet Monitor:** Displays real-time packet transmission, error counts, and system-wide RX/TX rates.
*   **Global Server Network:** Includes high-performance test nodes across Europe (Sweden, UK, France, Finland) and the USA.
*   **Throughput History (Sparklines):** Visualizes the consistency of your connection with live history graphs for every phase of the test.
*   **System Integration:** Provides detailed hardware information including local IP, MAC address, and active network interface details.

## 📊 Why PulseNetix?

Standard speed tests often use optimized routes that don't reflect real-world usage. PulseNetix is built for:
1.  **Gamers:** To identify if their upload/download is causing latency spikes.
2.  **Remote Workers:** To ensure stable video conferencing performance.
3.  **Power Users:** Who want to see the "raw" stats behind their ISP's claims.

## 🛠 Tech Stack

*   **Frontend:** HTML5, CSS3 (Vanilla), JavaScript
*   **Backend:** Node.js, Electron.js
*   **Network:** Native `http`/`https` modules for low-level socket performance.

## 🏁 Getting Started

1.  Clone the repository.
2.  Run `npm install` to install dependencies (Electron).
3.  Launch with `npm start`.
4.  Build for Windows with `npm run dist`.
5.  NOTE IT WILL TAKE 5 MINUTES BEFORE FULLY GIVEING THE ACTUAL RESULTS 

---
*Created by Ghulam Haider (Ahmad) Productions*
