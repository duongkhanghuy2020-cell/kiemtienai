// Zalo Bot - Khang Huy Apple
// Chạy trên Cloudflare Workers. Tự trả lời giá sửa, báo đơn cho chủ tiệm.
//
// Biến môi trường (Cloudflare > Worker > Settings > Variables and Secrets):
//   BOT_TOKEN       token bot nhận từ "Zalo Bot Manager"
//   WEBHOOK_SECRET  chuỗi bí mật tự đặt, 8-256 ký tự (chữ + số)
//   OWNER_CHAT_ID   chat id của chủ tiệm (nhắn /id cho bot để lấy)
// Binding KV (Settings > Bindings): DB  — lưu danh sách khách và khuyến mãi
// Cron trigger (Settings > Triggers): * * * * *  — gửi khuyến mãi từng đợt
//
// File này được tạo từ worker.template.js + bảng giá trên web bằng build.ps1.
// Sửa logic ở worker.template.js, đừng sửa worker.js trực tiếp.

const SHOP = {
  name: 'Khang Huy Apple',
  phone: '0981.308.308',
  address: '296 Lê Văn Thọ, P. Thông Tây Hội, HCM',
  hours: '8h - 21h hằng ngày',
};

const API = 'https://bot-api.zaloplatforms.com/bot';

// Gói Cloudflare miễn phí cho tối đa 50 lệnh gọi ra ngoài mỗi lần chạy, nên gửi khuyến mãi theo đợt
const BATCH = 35;

const PROMO_WORDS = /(^| )(khuyen mai|km|giam gia|uu dai|sale|chuong trinh|qua tang)( |$)/;
const STOP_WORDS = /^(huy km|tat km|ngung km|stop|\/stop)$/;
const START_WORDS = /^(nhan km|bat km|\/start)$/;

// Giá tiền công (nghìn đồng), trích từ bang-gia-professional.html
const PRICES = __PRICES__;

// Từ khóa khách hay dùng -> hạng mục trong bảng giá. Thứ tự quan trọng: cụ thể trước, chung sau.
const SERVICES = [
  ['Kính Camera sau', ['kinh camera', 'kinh cam', 'mat kinh camera']],
  ['Camera trước', ['camera truoc', 'cam truoc']],
  ['Camera sau', ['camera sau', 'cam sau', 'camera']],
  ['Kính lưng', ['kinh lung', 'mat lung', 'lung']],
  ['Ép kính / Ép cảm ứng', ['ep kinh', 'ep cam ung', 'vo kinh', 'be kinh', 'nut kinh', 'kinh', 'cam ung']],
  ['Phản quang', ['phan quang']],
  ['Màn hình', ['man hinh', 'thay man', 'man']],
  ['Thay pin', ['pin']],
  ['Độ vỏ/Sưởn', ['do vo', 'len vo', 'do suon']],
  ['Thay vỏ/Sưởn', ['thay vo', 'vo', 'suon']],
  ['Dây chân sạc', ['chan sac', 'sac']],
  ['Loa trong', ['loa trong', 'nghe goi']],
  ['Loa ngoài', ['loa ngoai', 'loa']],
  ['Face ID', ['face id', 'faceid']],
  ['Mở icloud', ['icloud']],
  ['Thay rung', ['rung']],
  ['Dây nguồn / Dây volume', ['nut nguon', 'day nguon', 'nut volume', 'nut am luong', 'volume']],
  ['Anten wifi', ['wifi', 'song']],
];

// Hạng mục hiện khi khách chỉ hỏi dòng máy
const POPULAR = ['Màn hình', 'Ép kính / Ép cảm ứng', 'Thay pin', 'Kính lưng', 'Camera sau'];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modelKey(name) {
  return norm(name).replace(/^iphone /, '').replace(/ pm$/, ' pro max');
}

const MODELS = Object.fromEntries(Object.keys(PRICES).map((k) => [modelKey(k), k]));

// Trả về { key, label } nếu tìm thấy dòng máy, key = null nếu máy không có trong bảng giá
function findModel(t) {
  const m = t.match(/(?:^| )(?:iphone|ip|i)? ?(xs ?max|xsm|xs|xr|x|1[1-7])(?: ?(pro ?max|promax|prm|pm|pro|plus|\+))?(?![a-z0-9])/);
  if (!m) return null;
  let base = m[1].replace(/ /g, '');
  if (base === 'xsmax' || base === 'xsm') base = 'xs max';
  let suffix = m[2] ? m[2].replace(/ /g, '') : '';
  if (['promax', 'prm', 'pm'].includes(suffix)) suffix = 'pro max';
  if (suffix === '+') suffix = 'plus';
  const key = suffix ? `${base} ${suffix}` : base;
  const label = 'iPhone ' + key.toUpperCase().replace('PRO MAX', 'Pro Max').replace('PRO', 'Pro').replace('PLUS', 'Plus').replace('XS MAX', 'XS Max');
  return { key: MODELS[key] ? key : null, label };
}

function findService(t) {
  const padded = ` ${t} `;
  for (const [name, words] of SERVICES) {
    if (words.some((w) => padded.includes(` ${w} `))) return name;
  }
  return null;
}

function findPhone(raw) {
  const m = String(raw || '').match(/(?:\+?84|0)(?:[ .-]?\d){9}(?!\d)/);
  return m ? m[0].replace(/[^\d+]/g, '') : null;
}

function money(v) {
  if (!v || v === 'Call') return 'liên hệ báo giá';
  return v.split('/').map((n) => `${Number(n).toLocaleString('de-DE')}.000đ`).join(' hoặc ') +
    (v.includes('/') ? ' (tùy loại linh kiện)' : '');
}

const CTA =
  `\n\nĐặt lịch: nhắn "Tên - SĐT - lỗi máy", Khang Huy gọi lại ngay.` +
  `\nHotline: ${SHOP.phone} | ${SHOP.address} | ${SHOP.hours}`;

const NOTE = '\nGiá là tiền công sửa, kiểm tra máy miễn phí, bảo hành 2 năm.';

// Quyết định trả lời khách. Trả về { reply, notify } — notify là tin báo cho chủ tiệm (hoặc null).
// promo: nội dung khuyến mãi đang chạy (hoặc rỗng).
function handleText(raw, sender, promo) {
  const r = answer(raw, sender, promo);
  if (promo && r.withPromo) r.reply += `\n\n🔥 KHUYẾN MÃI: ${promo}`;
  return r;
}

function answer(raw, sender, promo) {
  const t = norm(raw);
  const phone = findPhone(raw);
  const model = findModel(t);
  const service = findService(t);

  if (!phone && !service && PROMO_WORDS.test(t)) {
    return {
      reply: promo
        ? `🔥 Khuyến mãi đang có tại ${SHOP.name}:\n${promo}${CTA}`
        : `Hiện ${SHOP.name} chưa có chương trình khuyến mãi mới. Khi có, bot sẽ nhắn ngay cho anh/chị ạ!${CTA}`,
      notify: null,
    };
  }

  if (phone) {
    return {
      reply: `Cảm ơn ${sender.name || 'anh/chị'}! Khang Huy đã nhận thông tin, sẽ gọi lại số ${phone} trong ít phút để tư vấn và hẹn lịch ạ.`,
      notify: `🔔 ĐƠN MỚI TỪ ZALO BOT\nKhách: ${sender.name || '(không tên)'}\nSĐT: ${phone}\nNội dung: ${raw}`,
    };
  }

  if (model && model.key && service) {
    const v = PRICES[MODELS[model.key]][service];
    return { reply: `${service} ${model.label}: ${money(v)}.${NOTE}${CTA}`, notify: null, withPromo: true };
  }

  if (model && model.key) {
    const rows = POPULAR.map((s) => `• ${s}: ${money(PRICES[MODELS[model.key]][s])}`).join('\n');
    return {
      reply: `Giá sửa ${model.label} tại Khang Huy:\n${rows}\n\nAnh/chị cần sửa gì khác cứ nhắn, ví dụ "loa ${model.key}".${NOTE}${CTA}`,
      notify: null,
      withPromo: true,
    };
  }

  if (model && !model.key) {
    return {
      reply: `${model.label} Khang Huy có nhận sửa, kỹ thuật sẽ báo giá chính xác cho anh/chị trong ít phút ạ.${CTA}`,
      notify: `❓ Khách ${sender.name || ''} hỏi máy chưa có trong bảng giá:\n"${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`,
    };
  }

  if (service) {
    return {
      reply: `Anh/chị cho Khang Huy biết máy đời nào để báo giá ${service.toLowerCase()} chính xác nhé (ví dụ: "${service.toLowerCase()} 13 pro max").`,
      notify: null,
    };
  }

  const greeting = /^(hi|hello|alo|chao|xin chao|shop|ad|admin|e|em|a|anh|chi|ok|oke|cam on|thanks)( .*)?$/.test(t) || t.length < 4;
  return {
    reply:
      `Xin chào, đây là trợ lý tự động của ${SHOP.name} 📱\n` +
      `Anh/chị nhắn tên máy + lỗi để xem giá ngay, ví dụ:\n• "màn hình 12 pro max"\n• "thay pin 11"\n• "ép kính 14"` +
      CTA,
    notify: greeting ? null : `💬 Khách ${sender.name || ''} hỏi (bot chưa hiểu):\n"${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`,
    withPromo: true,
  };
}

// --- Danh sách khách (KV) ---
// Mỗi khách là 1 key "c:<chatId>", thông tin để trong metadata để list ra không cần đọc từng key.

async function saveCustomer(env, chatId, name, patch) {
  if (!env.DB) return;
  const key = `c:${chatId}`;
  const { metadata: old } = await env.DB.getWithMetadata(key);
  const now = Date.now();
  // Gói miễn phí giới hạn 1000 lần ghi/ngày: chỉ ghi khi khách mới, đổi trạng thái, hoặc sau 1 ngày
  if (old && !patch && old.n === (name || '') && now - old.l < 86400000) return;
  const meta = { n: name || '', f: old ? old.f : now, l: now, off: old ? !!old.off : false, ...(patch || {}) };
  await env.DB.put(key, '', { metadata: meta });
}

async function countCustomers(env) {
  let cursor, total = 0, off = 0;
  do {
    const page = await env.DB.list({ prefix: 'c:', cursor });
    total += page.keys.length;
    off += page.keys.filter((k) => k.metadata && k.metadata.off).length;
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { total, off };
}

function promoMessage(text) {
  return `🔥 ${SHOP.name.toUpperCase()} KHUYẾN MÃI\n\n${text}\n\n📞 ${SHOP.phone} | ${SHOP.address}\n(Nhắn "huy km" để ngừng nhận tin khuyến mãi)`;
}

// Chạy mỗi phút (cron): gửi khuyến mãi cho BATCH khách tiếp theo
async function runBroadcast(env) {
  if (!env.DB) return;
  const job = await env.DB.get('bc', 'json');
  if (!job) return;
  const page = await env.DB.list({ prefix: 'c:', cursor: job.cursor || undefined, limit: BATCH });
  for (const k of page.keys) {
    if (k.metadata && k.metadata.off) continue;
    const r = await send(env, k.name.slice(2), promoMessage(job.text));
    if (r && r.ok) job.sent++;
    else job.failed++;
  }
  if (page.list_complete) {
    await env.DB.delete('bc');
    await notifyOwner(env, `✅ Đã gửi khuyến mãi xong: ${job.sent} khách nhận được${job.failed ? `, ${job.failed} lỗi` : ''}.`);
  } else {
    job.cursor = page.cursor;
    await env.DB.put('bc', JSON.stringify(job));
  }
}

const OWNER_HELP =
  'Chào chủ tiệm 👋\n' +
  '• /km <nội dung>: gửi khuyến mãi cho TẤT CẢ khách + bot tự kèm khi trả lời giá\n' +
  '• /kmxem: xem khuyến mãi đang chạy\n' +
  '• /kmxoa: tắt khuyến mãi\n' +
  '• /khach: đếm số khách\n' +
  '• /tl <chat_id> <nội dung>: trả lời 1 khách\n' +
  'Các tin báo đơn sẽ gửi về đây.';

async function onOwner(env, chatId, text) {
  const reply = (s) => send(env, chatId, s);
  const m = text.match(/^\/tl\s+(\S+)\s+([\s\S]+)/);
  if (m) {
    const r = await send(env, m[1], m[2]);
    return reply(r && r.ok ? '✅ Đã gửi cho khách.' : `❌ Gửi lỗi: ${JSON.stringify(r)}`);
  }
  if (!/^\/(km|kmxem|kmxoa|khach)\b/.test(text)) return reply(OWNER_HELP);
  if (!env.DB) return reply('❌ Chưa gắn KV "DB" cho worker, xem Bước 5 trong hướng dẫn.');

  if (text === '/kmxem') {
    const promo = await env.DB.get('promo');
    return reply(promo ? `Khuyến mãi đang chạy:\n${promo}` : 'Chưa có khuyến mãi nào.');
  }
  if (text === '/kmxoa') {
    await env.DB.delete('promo');
    return reply('✅ Đã tắt khuyến mãi. Bot không kèm khuyến mãi khi trả lời nữa.');
  }
  if (text === '/khach') {
    const { total, off } = await countCustomers(env);
    return reply(`Có ${total} khách đã nhắn bot, ${total - off} khách đang nhận khuyến mãi.`);
  }
  const promo = text.replace(/^\/km\s*/, '').trim();
  if (!promo) return reply('Gõ: /km <nội dung khuyến mãi>\nVD: /km Giảm 20% thay pin đến hết 30/11');
  await env.DB.put('promo', promo.slice(0, 1500));
  await env.DB.put('bc', JSON.stringify({ text: promo.slice(0, 1500), cursor: null, sent: 0, failed: 0 }));
  const { total, off } = await countCustomers(env);
  return reply(`✅ Đã lưu khuyến mãi. Bot đang gửi cho ${total - off} khách, xong sẽ báo lại (mỗi phút ${BATCH} khách).\n\nXem trước tin khách nhận:\n\n${promoMessage(promo)}`);
}

async function callApi(env, method, body) {
  const res = await fetch(`${API}${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, status: res.status }));
}

function send(env, chatId, text) {
  return callApi(env, 'sendMessage', { chat_id: String(chatId), text: text.slice(0, 2000) });
}

function notifyOwner(env, text) {
  return env.OWNER_CHAT_ID ? send(env, env.OWNER_CHAT_ID, text) : null;
}

async function onUpdate(env, update) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const sender = { name: msg.from && msg.from.display_name, chatId };
  const text = (msg.text || '').trim();

  if (text === '/id') return send(env, chatId, `Chat id của bạn: ${chatId}`);

  if (env.OWNER_CHAT_ID && chatId === String(env.OWNER_CHAT_ID)) return onOwner(env, chatId, text);

  const t = norm(text);
  if (STOP_WORDS.test(t)) {
    await saveCustomer(env, chatId, sender.name, { off: true });
    return send(env, chatId, 'Đã ngừng gửi tin khuyến mãi cho anh/chị. Nhắn "nhan km" nếu muốn nhận lại ạ.');
  }
  if (START_WORDS.test(t)) {
    await saveCustomer(env, chatId, sender.name, { off: false });
    return send(env, chatId, `✅ Anh/chị sẽ nhận tin khuyến mãi mới nhất từ ${SHOP.name}.`);
  }
  await saveCustomer(env, chatId, sender.name);

  if (!update.event_name || update.event_name === 'message.text.received') {
    if (!text) return;
    const promo = env.DB ? await env.DB.get('promo') : null;
    const { reply, notify } = handleText(text, sender, promo);
    await send(env, chatId, reply);
    if (notify) await notifyOwner(env, notify);
    return;
  }

  // Ảnh, sticker, ghi âm...
  await send(env, chatId, `Khang Huy đã nhận tin của anh/chị, kỹ thuật sẽ xem và trả lời ngay ạ.${CTA}`);
  const kind = { image: 'ảnh', sticker: 'sticker', voice: 'ghi âm' }[update.event_name.split('.')[1]] || 'tin nhắn';
  await notifyOwner(env, `📎 Khách ${sender.name || ''} gửi ${kind} cho bot.\nTrả lời: /tl ${chatId} <nội dung>`);
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) },
  });
}

// Đơn đặt lịch từ form trên trang web
async function onOrder(request, env) {
  const h = cors(env);
  let d;
  try {
    d = (request.headers.get('Content-Type') || '').includes('json')
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: 'Dữ liệu không hợp lệ' }, 400, h);
  }
  if (d.website) return json({ ok: true }, 200, h); // ô bẫy chống spam bot
  const clip = (v, n) => String(v || '').trim().slice(0, n);
  const phone = findPhone(d.phone);
  if (!phone) return json({ ok: false, error: 'Số điện thoại chưa đúng' }, 400, h);
  const r = await notifyOwner(
    env,
    `🔔 ĐƠN MỚI TỪ WEBSITE\nKhách: ${clip(d.name, 60) || '(không tên)'}\nSĐT: ${phone}\nMáy: ${clip(d.model, 60)}\nLỗi: ${clip(d.issue, 500)}`
  );
  if (!r || !r.ok) return json({ ok: false, error: 'Chưa gửi được, vui lòng gọi hotline' }, 502, h);
  return json({ ok: true }, 200, h);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/webhook' && request.method === 'POST') {
      if (request.headers.get('X-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      const body = await request.json().catch(() => null);
      const update = body && (body.result || body);
      if (update) ctx.waitUntil(onUpdate(env, update).catch((e) => console.error(e)));
      return json({ ok: true });
    }

    if (url.pathname === '/order') {
      if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
      if (request.method === 'POST') return onOrder(request, env);
    }

    // Mở 1 lần sau khi deploy: https://<worker>/setup?key=<WEBHOOK_SECRET>
    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) {
        return new Response('Sai key', { status: 403 });
      }
      const r = await callApi(env, 'setWebhook', {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
      });
      return json(r);
    }

    return new Response(`${SHOP.name} Zalo bot đang chạy ✅`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBroadcast(env).catch((e) => console.error(e)));
  },
};
