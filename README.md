# LV Takeoff Intelligence

AI-Powered Low-Voltage Construction Estimation tool by **3D Technology Services**.

![3D Technology Services](public/logo.png)

## Features

- 📄 **PDF Floor Plan Analysis** - Upload construction floor plans for AI-powered device detection
- 🔌 **Structured Cabling** - Data outlets, voice outlets, WAPs, fiber
- 🔒 **Access Control** - Card readers, REX sensors, door contacts, electric strikes
- 📹 **CCTV** - Dome cameras, bullet cameras, PTZ cameras
- 🔥 **Fire Alarm** - Smoke detectors, heat detectors, pull stations, horn/strobes
- 📊 **Bill of Materials** - Automatic BOM generation with pricing
- 📦 **Export** - CSV export for estimating software

## Tech Stack

- **React** + **Vite** for fast development
- **Google Gemini AI** for floor plan analysis
- **PDF.js** for PDF rendering
- **Tailwind-style CSS** with custom black & gold theme

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your API key:
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
├── LV-Takeoff-App.jsx      # Main application component
├── src/
│   ├── components/
│   │   ├── DetailedBOM.jsx         # Detailed BOM with pricing
│   │   ├── FloorPlanOverlay.jsx    # PDF overlay viewer
│   │   ├── ProjectManagerPortal.jsx # PM dashboard
│   │   └── SettingsPortal.jsx      # Project settings
│   ├── services/
│   │   └── blueprintAnalyzer.js    # Gemini AI integration
│   └── index.css                   # Global styles (black & gold theme)
├── public/
│   └── logo.png                    # 3D Technology Services logo
└── index.html
```

## License

Proprietary - 3D Technology Services
