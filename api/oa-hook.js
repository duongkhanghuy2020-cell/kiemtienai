// Zalo OA webhook: Zalo không gọi được tên miền workers.dev, nên Zalo gửi tin về đây rồi chuyển nguyên văn sang bot.
// Bot tự kiểm tra chữ ký X-ZEvent-Signature.
const BOT = 'https://khanghuyapple-bot.crimson-recipe-0ba6.workers.dev/oa/hook';

export async function GET() {
  return new Response('ok');
}

export async function POST(request) {
  const body = await request.text();
  const res = await fetch(BOT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ZEvent-Signature': request.headers.get('x-zevent-signature') || '' },
    body,
  });
  return new Response(await res.text(), { status: res.status === 401 ? 401 : 200, headers: { 'Content-Type': 'application/json' } });
}
