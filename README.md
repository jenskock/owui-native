# Open Web UI - Native iOS Client

A React Native iOS client for [Open Web UI](https://github.com/open-webui/open-webui), built with best practices.

## Features

- **Authentication** – Open Web UI native auth (username/password, no SSO)
- **Chats** – Access all your chats and create new ones
- **Model selection** – Choose from available models on your instance
- **Response streaming** – Real-time streaming responses
- **File upload** – Attach files to messages (images, documents)

## Requirements

- Node.js >= 22.11
- Xcode (for iOS)
- CocoaPods
- iOS Simulator or physical device

## Setup

```bash
# Install dependencies
npm install

# iOS: Install CocoaPods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on iOS (in another terminal)
npm run ios
```

## Configuration

1. **Login** – Enter your Open Web UI instance URL (e.g. `https://openwebui.example.com`), username, and password.
2. **Instance URL** – Must use HTTPS for production. Local development with `http://localhost` may require ATS exceptions.

## Project Structure

```
src/
├── api/           # Open Web UI API client
├── constants/     # App constants
├── contexts/     # Auth context
├── navigation/   # Navigation types
├── screens/      # Login, Chats, Chat
└── types/        # TypeScript types
```

## API Compatibility

Built for Open Web UI API:

- `POST /api/login` – Authentication
- `GET /api/chats` – List chats
- `POST /api/chats` – Create chat
- `GET /api/chats/:id` – Get chat with messages
- `GET /api/models` – List models
- `POST /api/chat` – Chat completion (streaming)

## License

MIT
