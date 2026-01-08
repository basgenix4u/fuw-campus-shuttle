# 🚐 Shuttle AI
## AI-Powered Campus Shuttle System for Federal University Wukari

### Overview

Shuttle AI is a comprehensive mobile and web application for managing on-demand campus shuttle rides using artificial intelligence for vehicle allocation, demand prediction, and route optimization.

---

### Features

#### For Passengers
- 📱 Request rides with pickup/dropoff selection
- 🗺️ Real-time ride tracking
- 📊 View ride history
- ⭐ Rate completed rides

#### For Drivers
- 🚗 Toggle availability status
- 📋 View and accept ride requests
- 📍 Update ride status (arriving, in progress, completed)
- 📈 View personal statistics

#### For Administrators
- 📊 Real-time dashboard with statistics
- 🗺️ Live vehicle tracking map
- 📈 Analytics and reports
- 🤖 AI insights and predictions

---

### Technology Stack

| Component | Technology |
|-----------|------------|
| Mobile App | React Native (Expo) |
| Admin Dashboard | HTML, CSS, JavaScript |
| Backend | Supabase (PostgreSQL) |
| AI/ML | Python (Scikit-learn) |
| Maps | Leaflet.js + OpenStreetMap |
| Real-time | Supabase Realtime |

---

### Installation

#### Prerequisites
- Node.js v18+
- npm or yarn
- Expo Go app (for mobile testing)
- Python 3.8+ (for AI models)

#### Mobile App Setup
```bash
cd mobile-app
npm install
npx expo start