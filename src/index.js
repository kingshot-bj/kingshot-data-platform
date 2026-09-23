export default {
  async fetch(request) {
    return new Response(
      `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KingShot Data Platform — EagleEye</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .container {
      text-align: center;
      padding: 32px;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 12px;
    }
.subtitle {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 4px;
  color: #f59e0b;
  margin-bottom: 24px;
  text-transform: uppercase;
}
    p {
      color: #94a3b8;
      font-size: 16px;
    }

    .status {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 16px;
      border-radius: 999px;
      background: #14532d;
      color: #86efac;
    }
  </style>
</head>

<body>
  <main class="container">
    <h1>KingShot Data Platform</h1>
    <div class="subtitle">EagleEye</div>
    <p>KingShotのデータを集約・分析するプラットフォーム</p>
    <div class="status">● System Online</div>
  </main>
</body>
</html>`,
      {
        headers: {
          "content-type": "text/html; charset=UTF-8"
        }
      }
    );
  }
};
