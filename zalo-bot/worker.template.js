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
  phone: '0981.308.308 - 0909.06.7474',
  address: '296 Lê Văn Thọ, P. Thông Tây Hội, HCM',
  hours: '8h - 21h hằng ngày',
};

const API = 'https://bot-api.zaloplatforms.com/bot';

// Gói Cloudflare miễn phí cho tối đa 50 lệnh gọi ra ngoài mỗi lần chạy: chia cho việc lấy tin và gửi khuyến mãi
const POLL_BUDGET = 20;
const BATCH = 25;

const PROMO_WORDS = /(^| )(khuyen mai|km|giam gia|uu dai|sale|chuong trinh|qua tang)( |$)/;
const STOP_WORDS = /^(huy km|tat km|ngung km|stop|\/stop)$/;
const START_WORDS = /^(nhan km|bat km|\/start)$/;

// Giá sửa chữa lấy từ https://khanghuyapple.lovable.app/bang-gia-sua-chua bằng sua-chua.ps1 (0 = liên hệ báo giá)
const SUA = __SUA__;

// Từ khóa khách hay dùng -> [tên lỗi, từ khóa, đầu tên dịch vụ trên trang giá sửa]. Cụ thể trước, chung sau.
const SERVICES = [
  ['kính camera', ['kinh camera', 'kinh cam'], ['Thay kính camera']],
  ['camera trước', ['camera truoc', 'cam truoc'], ['Thay camera trước']],
  ['camera rung, mờ', ['camera rung', 'camera mo', 'cam rung', 'cam mo'], ['Sửa camera rung, mờ']],
  ['camera sau', ['camera sau', 'cam sau', 'camera'], ['Thay camera sau']],
  ['kính lưng', ['kinh lung', 'mat lung', 'lung'], ['Thay kính lưng']],
  ['màn hình xanh, trắng', ['man xanh', 'man trang', 'soc man', 'man soc', 'man hinh xanh'], ['Sửa màn hình xanh, trắng']],
  ['kính màn hình', ['ep kinh', 'ep cam ung', 'vo kinh', 'be kinh', 'nut kinh', 'kinh man', 'kinh'], ['Thay kính màn hình']],
  ['màn hình', ['man hinh', 'thay man', 'man'], ['Thay màn hình zin', 'Thay màn hình linh kiện']],
  ['pin', ['pin', 'chai pin'], ['Thay pin tiêu chuẩn', 'Thay pin zin']],
  ['chân sạc', ['chan sac', 'khong sac', 'sac'], ['Thay chân sạc', 'Sửa USB sạc trên main']],
  ['Face ID', ['face id', 'faceid'], ['Sửa Face ID']],
  ['vỏ, sườn', ['thay vo', 'do vo', 'vo', 'suon'], ['Thay vỏ iPhone', 'Thay vỏ / sườn']],
  ['loa trong', ['loa trong', 'nghe goi', 'loa nghe'], ['Thay loa trong']],
  ['loa ngoài', ['loa ngoai', 'loa'], ['Thay loa ngoài']],
  ['iCloud', ['icloud'], ['Mở iCloud']],
  ['rung', ['rung'], ['Thay rung']],
  ['nút nguồn, âm lượng', ['nut nguon', 'day nguon', 'nut volume', 'nut am luong', 'volume'], ['Thay dây nguồn']],
  ['lỗi nguồn', ['mat nguon', 'khong len nguon', 'loi nguon', 'nguon'], ['Sửa lỗi nguồn', 'Sửa IC nguồn']],
  ['Wi-Fi, Bluetooth', ['wifi', 'bluetooth'], ['Sửa Wi-Fi', 'Thay anten Wi-Fi', 'Sửa IC Wi-Fi']],
  ['sóng, SIM', ['song', 'sim', 'imei', 'mat song'], ['Sửa lỗi SIM', 'Sửa IC sóng']],
  ['cảm biến', ['cam bien'], ['Thay dây cảm biến', 'Sửa cảm biến trên main']],
  ['cảm ứng', ['cam ung', 'liet cam ung'], ['Sửa hiển thị / cảm ứng trên main']],
  ['âm thanh', ['mat tieng', 'audio', 'mic'], ['Sửa Audio main']],
  ['ổ cứng', ['o cung', 'dung luong'], ['Sửa ổ cứng']],
  ['đèn flash', ['den flash', 'ic den', 'den'], ['Sửa IC đèn']],
];

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

const DEVICES = Object.keys(SUA.devices).map((name) => ({ name, t: norm(name) }));

// Tên dòng máy trên trang giá sửa (VD "iPhone 13 mini", "iPad Gen 10"), hoặc tên tự đặt nếu trang không có
function findDevice(t) {
  if (/(^| )ipad( |$)/.test(t)) {
    let best = null, score = 0;
    for (const d of DEVICES.filter((x) => x.t.startsWith('ipad '))) {
      const s = d.t.split(' ').slice(1).filter((w) => ` ${t} `.includes(` ${w} `)).length;
      if (s > score) { best = d; score = s; }
    }
    return best ? best.name : 'iPad';
  }
  const key = phoneKey(t);
  if (!key) return null;
  const d = DEVICES.find((x) => x.t === `iphone ${key}`);
  return d ? d.name : labelOf(key);
}

function findService(t) {
  const padded = ` ${t} `;
  return SERVICES.find(([, words]) => words.some((w) => padded.includes(` ${w} `))) || null;
}

// "Thay màn hình zin (Zin TM)" => "Màn hình zin (Zin TM)"
const shortName = (s) => s.replace(/^(Thay|Sửa) /, '').replace(/^./, (c) => c.toUpperCase());
const lowerFirst = (s) => s.replace(/^./, (c) => c.toLowerCase());

function repairAnswer(t, raw, sender, svc) {
  const dev = findDevice(t);
  const ask = `❓ Khách ${sender.name || ''} hỏi giá sửa (chưa có giá): "${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`;
  if (!dev) {
    return svc ? { reply: `Dạ, anh/chị cho em xin đời máy để em báo giá ${svc[0]} chính xác ạ (VD: "${svc[0]} 13 pro max").`, notify: null } : null;
  }
  if (dev === 'iPad') {
    return { reply: `Dạ, anh/chị cho em xin đời iPad (VD: "iPad Gen 10", "iPad Pro 11 M1") để em báo giá chính xác ạ.`, notify: null };
  }
  const prices = SUA.devices[dev];
  const later = { reply: `Dạ ${svc ? `${svc[0]} ` : ''}${dev} bên em báo giá trực tiếp ạ, kỹ thuật sẽ báo giá cho anh/chị trong ít phút ạ.${CTA}`, notify: ask };
  if (!prices) return later;
  if (svc) {
    const rows = Object.entries(prices).filter(([k, v]) => v > 0 && svc[2].some((p) => k.startsWith(p)));
    if (!rows.length) return later;
    const reply = rows.length === 1
      ? `Dạ, ${lowerFirst(rows[0][0])} ${dev} bên em giá ${vnd(rows[0][1])} ạ.`
      : `Dạ, ${svc[0]} ${dev} bên em có ${rows.length} loại ạ:\n${rows.map(([k, v]) => `• ${shortName(k)}: ${vnd(v)}`).join('\n')}`;
    return { reply: reply + NOTE + CTA, notify: null, withPromo: true };
  }
  // Chỉ hỏi dòng máy: báo vài lỗi hay gặp
  const top = Object.entries(prices).filter(([, v]) => v > 0).slice(0, 5);
  if (!top.length) return later;
  return {
    reply: `Dạ, giá sửa ${dev} một số lỗi thường gặp ạ:\n${top.map(([k, v]) => `• ${shortName(k)}: ${vnd(v)}`).join('\n')}\nAnh/chị cần sửa lỗi nào, nhắn em để báo giá chính xác ạ.${CTA}`,
    notify: null,
    withPromo: true,
  };
}

function findPhone(raw) {
  const m = String(raw || '').match(/(?:\+?84|0)(?:[ .-]?\d){9}(?!\d)/);
  return m ? m[0].replace(/[^\d+]/g, '') : null;
}

// Ngắn gọn: hỏi gì trả lời nấy, cuối tin chỉ 1 dòng mời đặt lịch
const CTA = `\nAnh/chị cần đặt lịch, nhắn giúp em "Tên - SĐT" ạ. 📞 ${SHOP.phone}`;

const NOTE = '\nBên em kiểm tra máy miễn phí, bảo hành 6 - 12 tháng ạ.';

// --- Bán máy: new nguyên seal + máy có sẵn 99% ---
// Dữ liệu lấy từ trang https://khanghuyapple.lovable.app qua kho-may.ps1 (trang lovable là nguồn giá duy nhất).
const KHO = __KHO__;

const SALE_WORDS = /(^| )(mua|ban|con hang|co san|con may|may moi|new|seal|nguyen seal|like new|may cu|99|98|tra gop|len doi|gia may|bao nhieu tien)( |$)/;
const NEW_WORDS = /(^| )(new|moi|seal|nguyen seal|chua active)( |$)/;
const USED_WORDS = /(^| )(99|98|cu|like new|qua su dung)( |$)/;
const CATS = [
  ['ipad', /(^| )ipad( |$)/, 'iPad'],
  ['mac', /(^| )(macbook|mac|laptop)( |$)/, 'MacBook / laptop'],
  ['watch', /(^| )(apple watch|watch|dong ho)( |$)/, 'Apple Watch'],
  ['samsung', /(^| )(samsung|ss|galaxy)( |$)/, 'Samsung'],
];
const ORIGIN = { 'V.NAM': 'VN', USA: 'Mỹ', SING: 'Sing', VC: 'CPO' };

// "18 pm 256g ..." => "18 pro max"; "ip 17 promax ..." => "17 pro max"; "iphone duo ..." => "duo"
function phoneKey(t) {
  // Khách hay viết liền: "17prm", "ip18promax", "iphone17pm" => cho phép không có dấu cách
  const m = t.match(/(?:^| )(?:iphone ?|ip ?|i )?(duo|xs ?max|xs|xr|x|6s ?plus|[6-8] ?plus|1[0-9]e|1[0-9]) ?(pro ?max|promax|prm|pm|pro|plus|air|mini)?(?= |$)/);
  if (!m) return null;
  const base = m[1].replace(/ /g, '').replace('xsmax', 'xs max').replace(/^(6s|[6-8])plus$/, '$1 plus');
  if (/plus$/.test(base)) return base;
  let suf = (m[2] || '').replace(/ /g, '');
  if (['promax', 'prm', 'pm'].includes(suf)) suf = 'pro max';
  return suf ? `${base} ${suf}` : base;
}

// Khách viết tắt/viết liền (17prm, ip13pm, 18promax, 15 pm...) => bot đoán rồi hỏi lại cho chắc
function isShorthand(t) {
  return /(?:^| )(?:iphone|ip|i)?\d{1,2}e?(?:prm|pm|promax|pro|plus|mini|air)(?= |$)|(?:^| )(?:ip|i) ?\d|(?:^| )\d{1,2} (?:prm|pm|promax)(?= |$)|(?:^| )xsmax(?= |$)|(?:^| )[6-8]plus(?= |$)/.test(t);
}
const confirmOf = (label) => `Dạ, anh/chị hỏi ${label} phải không ạ? `;

function capOf(t) {
  let m = t.match(/(?:^| )(\d{2,4}) ?(?:gb|g)(?= |$)/);
  if (m) return `${m[1]}GB`;
  m = t.match(/(?:^| )([1-4]) ?(?:tb|t)(?= |$)/);
  if (m) return `${m[1]}TB`;
  m = t.match(/(?:^| )(64|128|256|512)(?= |$)/);
  return m ? `${m[1]}GB` : '';
}

function labelOf(key) {
  const words = { duo: 'Duo', pro: 'Pro', max: 'Max', plus: 'Plus', air: 'Air', mini: 'mini', xs: 'XS', xr: 'XR', x: 'X' };
  return 'iPhone ' + key.split(' ').map((w) => words[w] || w).join(' ');
}

// Chữ viết tắt trong file kho (thầy giải thích): TMZ thay màn zin, TV thay vỏ zin, BLOCK/LOCK máy lock
const ABBR = { TMZ: 'thay màn zin', TM: 'thay màn', TV: 'thay vỏ zin', BLOCK: 'máy lock', LOCK: 'máy lock' };
function expand(s) {
  return String(s || '')
    .replace(/SẠC\s*(\d+)/i, 'sạc $1 lần')
    .replace(/(^|[\s,(])(TMZ|TM|TV|BLOCK|LOCK)(?=$|[\s,)])/g, (_, a, w) => a + ABBR[w])
    .replace(/^[-–\s]+|[-–\s]+$/g, '')
    .toLowerCase();
}

const STOCK = KHO.items.map((it) => {
  const t = norm(it.n);
  const x = { ...it, key: it.c === 'iphone' ? phoneKey(t) : null, cap: capOf(t) || capOf(norm(it.cap || '')) };
  if (it.s === 'n') {
    const m = it.n.match(/\d+\s?(?:GB|G|TB|T)\s+(.+?)(?:\s+(?:X\/A|ZP|LL|VN|CPO|SG|Full|VAT|\(|-)|$)/i);
    x.col = m ? m[1].trim() : '';
    x.cond = 'new';
    x.active = !/chưa/i.test(it.st || '');
    x.vat = /VAT/i.test(it.n);
  } else {
    const m = it.n.match(/(\d{2})%\s*(.*)$/);
    x.cond = /NEW/i.test(it.n) ? 'new đã active' : m ? `máy ${m[1]}%` : 'máy cũ';
    const extra = expand(m ? m[2] : '');
    const note = String(it.note || '').toLowerCase().trim();
    // Ghi chú đã nói rõ (VD "thay màn zin + pin zin 91%") thì bỏ phần viết tắt trùng ý
    x.extra = [extra && !note.includes(extra) ? extra : '', note].filter(Boolean).join(', ');
  }
  return x;
});

const vnd = (p) => (p > 0 ? `${p.toLocaleString('de-DE')}đ` : 'liên hệ');
const byPrice = (a, b) => (a.p || Infinity) - (b.p || Infinity);
const capNum = (c) => (parseInt(c, 10) || 0) * (/TB/.test(c) ? 1024 : 1);

const SALE_CTA = `\nAnh/chị muốn xem hoặc giữ máy, nhắn giúp em "Tên - SĐT" ạ. 📞 ${SHOP.phone}`;
const ORDER_CTA = `\nAnh/chị muốn đặt máy, nhắn giúp em "Tên - SĐT", bên em kiểm tra nguồn hàng và báo lại ngày có máy ạ. 📞 ${SHOP.phone}`;

function newLines(items, detailed) {
  if (detailed || items.length <= 6) {
    const list = items.slice().sort(byPrice);
    const lines = list.slice(0, 8).map((x) =>
      x.c === 'iphone'
        ? `• ${x.cap} ${x.col} – ${ORIGIN[x.o] || x.o}${x.vat ? ', Full VAT' : ''}${x.active ? ', đã active' : ''}: ${vnd(x.p)}`
        : `• ${x.n}: ${vnd(x.p)}`
    );
    if (list.length > 8) lines.push(`… và ${list.length - 8} máy khác ạ.`);
    return lines.join('\n');
  }
  // Nhiều máy: gom theo dung lượng, báo khoảng giá và màu
  const caps = [...new Set(items.map((x) => x.cap))].sort((a, b) => capNum(a) - capNum(b));
  const lines = caps.map((cap) => {
    const g = items.filter((x) => x.cap === cap);
    const prices = g.map((x) => x.p).filter((p) => p > 0);
    const nice = (c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
    const cols = [...new Set(g.map((x) => nice(x.col)).filter(Boolean))].join(', ');
    const range = !prices.length ? 'liên hệ'
      : Math.min(...prices) === Math.max(...prices) ? vnd(prices[0])
      : `${vnd(Math.min(...prices))} – ${vnd(Math.max(...prices))}`;
    return `• ${cap}: ${range}${cols ? ` (${cols})` : ''}`;
  });
  lines.push('Anh/chị nhắn kèm dung lượng (VD: "256GB") để em báo giá từng màu, bản VN/Mỹ ạ.');
  return lines.join('\n');
}

function usedLines(items) {
  const list = items.slice().sort(byPrice);
  const lines = list.slice(0, 8).map((x) =>
    x.c === 'iphone'
      ? `• ${x.cap} ${x.col}, ${x.cond}${x.pin ? `, pin ${x.pin}` : ''}${x.extra ? ` (${x.extra})` : ''}: ${vnd(x.p)}`
      : `• ${x.n}${x.col ? ` ${x.col}` : ''}${x.cap ? ` ${x.cap}` : ''}: ${vnd(x.p)}`
  );
  if (list.length > 8) lines.push(`… và ${list.length - 8} máy khác ạ.`);
  return lines.join('\n');
}

// Trả về câu trả lời bán máy, hoặc null nếu khách đang hỏi sửa máy
function saleAnswer(t, raw, sender, service) {
  if (service) return null;
  const cat = CATS.find(([, re]) => re.test(t));
  const key = cat ? null : phoneKey(t);
  // "có iphone 16e không" là hỏi có bán không, kể cả khi không có chữ "mua"
  const intent = SALE_WORDS.test(t) || (/(^| )co (ban |san )?(iphone|ip|may)( |$)/.test(t) && /(^| )khong( |$)/.test(t));
  if (!cat && !key) {
    // "giá máy", "mua máy" chưa nói dòng nào => hỏi lại, kèm các dòng đang có
    if (!/(^| )(gia may|mua may|may nao|con may|ban may|may moi|may 99|may cu)( |$)/.test(t)) return null;
    const lines = [...new Set(STOCK.filter((x) => x.key && x.p > 0).map((x) => labelOf(x.key).replace('iPhone ', '')))];
    return {
      reply: `Dạ, anh/chị muốn xem giá máy nào ạ? Bên em đang có iPhone ${lines.slice(0, 12).join(', ')}, iPad, Samsung… Anh/chị nhắn giúp em tên máy (VD: "17 pro max 256") để em báo giá ngay ạ.`,
      notify: null,
    };
  }
  const label = cat ? cat[2] : labelOf(key);
  const notify = (note) => `💰 Khách ${sender.name || ''} hỏi mua ${label}${note}: "${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`;

  let list = STOCK.filter((x) => (cat ? x.c === cat[0] : x.key === key));
  if (!list.length) {
    if (!intent) return null; // dòng không bán => để phần sửa máy trả lời
    return {
      reply: `Dạ ${label} hiện bên em chưa có sẵn ạ. Em đã báo kỹ thuật kiểm tra nguồn hàng, bên em sẽ báo lại anh/chị ngay ạ.${SALE_CTA}`,
      notify: notify(' (chưa có hàng)'),
    };
  }
  const wantNew = NEW_WORDS.test(t), wantUsed = USED_WORDS.test(t);
  if (wantNew !== wantUsed) {
    const f = list.filter((x) => (wantNew ? x.s === 'n' || /new/.test(x.cond) : x.s === 'u' && !/new/.test(x.cond)));
    if (!f.length) {
      return {
        reply: `Dạ ${label} ${wantNew ? 'máy mới' : 'máy 99%'} hiện bên em chưa có sẵn ạ. Anh/chị nhắn "${norm(raw).replace(/ (new|moi|seal|99|98|cu)( |$)/g, ' ').trim()}" để xem các máy đang có, hoặc để lại SĐT để bên em tìm hàng giúp anh/chị ạ.${SALE_CTA}`,
        notify: notify(` (chưa có ${wantNew ? 'máy mới' : 'máy 99%'})`),
      };
    }
    list = f;
  }
  const cap = capOf(t);
  let capNote = '';
  if (cap) {
    const f = list.filter((x) => x.cap === cap);
    if (f.length) list = f;
    else capNote = `\nDạ bản ${cap} hiện chưa có, em gửi anh/chị các bản đang có ạ.`;
  }
  const fresh = list.filter((x) => x.s === 'n');
  const used = list.filter((x) => x.s === 'u');
  const parts = [];
  // Máy mới nguyên seal phải đặt hàng trước, chỉ "máy có sẵn tại tiệm" mới xem được ngay
  if (fresh.length) parts.push(`🆕 MÁY MỚI NGUYÊN SEAL (đặt hàng trước):\n${newLines(fresh, !!(cap && !capNote) || !!cat)}`);
  if (used.length) parts.push(`✨ MÁY CÓ SẴN TẠI TIỆM:\n${usedLines(used)}`);
  return {
    reply:
      `${isShorthand(t) ? `${confirmOf(label)}Em gửi giá máy ạ:` : `Dạ, anh/chị quan tâm ${label} ạ. Giá bên em như sau:`}${capNote}\n\n${parts.join('\n\n')}\n\n` +
      `Giá cập nhật ${KHO.updated}, bên em hỗ trợ trả góp ạ.${used.length ? SALE_CTA : ORDER_CTA}`,
    notify: notify(''),
  };
}

// Thu cũ đổi mới / khách bán máy cũ. Giá thu phải xem máy nên bot hỏi tình trạng, báo chủ tiệm định giá.
// "đổi 13 pro max lên 17 pro max": phần sau "lên/qua/sang/lấy" là máy muốn đổi, kèm luôn giá máy đó.
const TRADE_WORDS = /(^| )(doi may|doi dien thoai|doi dt|thu cu|len doi|doi cu|doi moi|doi ngang|bu tien|bu them|ban lai|thu mua|muon ban|can ban|ban may cu|thu may|thu lai|thu bao nhieu)( |$)/;
const SELL_WORDS = /(^| )(ban lai|thu mua|muon ban|can ban|ban may cu|thu may|thu lai|thu bao nhieu)( |$)/;
const TRADE_INFO = /(^| )(\d+ ?(gb|g|tb)|pin( con)? \d+|tray|xuoc|be|mop|nut|da sua|chua sua|con dep|nguyen ban|zin)( |$)/;

function tradeAnswer(t, raw, sender) {
  // "đổi 13 pro max lên 17 pro max" không có chữ "đổi máy" nhưng vẫn là đổi máy
  if (!TRADE_WORDS.test(t) && !/(^| )doi .* (len|qua|sang|lay) /.test(t)) return null;
  // "lên đời 16 pro max": 16 Pro Max là máy muốn lên, không phải máy cũ
  const m = t.match(/^(.*?)(?:^| )(?:len doi|len|qua|sang|lay) (.+)$/);
  const oldKey = phoneKey(m ? m[1] : t);
  const target = m && phoneKey(m[2]) ? saleAnswer(`mua ${m[2]}`, raw, sender, null) : null;
  const sell = SELL_WORDS.test(t) && !target;
  const mine = oldKey ? `máy ${labelOf(oldKey)}` : 'máy';
  const lines = [
    sell
      ? `Dạ, em cảm ơn anh/chị đã quan tâm ạ. Bên em có thu mua ${mine} cũ. Giá thu phụ thuộc vào tình trạng thực tế của máy, nên em xin phép báo giá dự kiến trước ạ.`
      : `Dạ, em cảm ơn anh/chị đã quan tâm ạ. Bên em có thu cũ đổi mới: ${mine} cũ của anh/chị được trừ vào giá máy mới, anh/chị bù phần chênh lệch ạ. Giá thu phụ thuộc vào tình trạng thực tế của máy, nên em xin phép báo giá dự kiến trước ạ.`,
    `Để bên em báo giá dự kiến, anh/chị nhắn giúp em:\n${oldKey ? '• Dung lượng máy (VD: 128GB, 256GB)' : '• Đời máy, dung lượng (VD: 13 Pro Max 256GB)'}\n• Pin còn bao nhiêu %\n• Máy có trầy, bể, từng sửa hay thay linh kiện chưa\n• Kèm 2 – 3 hình mặt trước, mặt sau ạ`,
  ];
  // Chỉ báo giá máy khách muốn lên đời, bỏ câu mở đầu của phần báo giá
  if (target) lines.push(`👉 Giá ${labelOf(phoneKey(m[2]))} bên em:\n${target.reply.replace(SALE_CTA, '').replace(ORDER_CTA, '').replace(/^.*\n+/, '')}`);
  lines.push(`Giá chính xác sẽ được chốt khi anh/chị mang máy qua tiệm để kỹ thuật viên kiểm tra trực tiếp ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone}`);
  return {
    reply: lines.join('\n\n'),
    notify: `🔄 Khách ${sender.name || ''} muốn ${sell ? 'bán' : 'đổi'} máy: "${raw}"\nBot chưa báo giá thu, thầy báo giá dự kiến cho khách.\nTrả lời: /tl ${sender.chatId} <nội dung>`,
    withPromo: true,
  };
}

// Quyết định trả lời khách. Trả về { reply, notify } — notify là tin báo cho chủ tiệm (hoặc null).
// promo: nội dung khuyến mãi đang chạy (hoặc rỗng).
function handleText(raw, sender, promo) {
  const r = answer(raw, sender, promo);
  if (promo && r.withPromo) {
    // Khuyến mãi dài (gộp nhiều mẫu) thì chỉ nhắc ngắn để tin báo giá không quá dài
    r.reply += promo.length > 250
      ? `\n\n🔥 Dạ hiện bên em đang có khuyến mãi, anh/chị nhắn "khuyến mãi" để xem chi tiết ạ.`
      : `\n\n🔥 KHUYẾN MÃI: ${promo}`;
  }
  return r;
}

function answer(raw, sender, promo) {
  const t = norm(raw);
  const phone = findPhone(raw);
  const service = findService(t);

  if (!phone && !service && PROMO_WORDS.test(t)) {
    return {
      reply: promo
        ? `Dạ, ${SHOP.name} gửi anh/chị chương trình khuyến mãi đang áp dụng ạ:\n\n${promo}${CTA}`
        : `Dạ hiện ${SHOP.name} chưa có chương trình khuyến mãi mới ạ. Khi có ưu đãi, bên em sẽ nhắn ngay cho anh/chị ạ.${CTA}`,
      notify: null,
    };
  }

  if (phone) {
    return {
      reply: `Dạ em cảm ơn anh/chị${sender.name ? ' ' + sender.name : ''} ạ! ${SHOP.name} đã nhận thông tin, bên em sẽ gọi lại số ${phone} trong ít phút để tư vấn và hẹn lịch cho anh/chị ạ.`,
      notify: `🔔 ĐƠN MỚI TỪ ZALO BOT\nKhách: ${sender.name || '(không tên)'}\nSĐT: ${phone}\nNội dung: ${raw}`,
    };
  }

  const trade = service ? null : tradeAnswer(t, raw, sender);
  if (trade) return trade;

  const sale = saleAnswer(t, raw, sender, service);
  if (sale) return sale;

  const repair = repairAnswer(t, raw, sender, service);
  if (repair) {
    const dev = findDevice(t);
    if (dev && dev !== 'iPad' && isShorthand(t)) {
      repair.reply = confirmOf(dev) + repair.reply.replace(/^Dạ,? /, '').replace(/^./, (c) => c.toUpperCase());
    }
    return repair;
  }

  // Có số/chữ giống tên máy nhưng không đoán được => hướng dẫn cách viết
  if (/\d/.test(t) && !PROMO_WORDS.test(t)) {
    return {
      reply:
        `Dạ em chưa rõ anh/chị hỏi dòng máy nào ạ. Anh/chị nhắn giúp em theo mẫu:\n` +
        `• Hỏi giá máy: "giá 17 pro max 256" hoặc "mua 15 pro 99"\n` +
        `• Hỏi giá sửa: "màn hình 13 pro max" hoặc "thay pin 12"`,
      notify: `💬 Khách ${sender.name || ''} hỏi (bot chưa hiểu):\n"${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`,
    };
  }

  if (/(^| )bao hanh( |$)/.test(t)) {
    return {
      reply: `Dạ, bên em bảo hành 6 – 12 tháng tùy linh kiện, 1 đổi 1 trong 30 ngày đầu ạ. Anh/chị đã sửa máy tại tiệm thì nhắn giúp em số điện thoại ghi trên phiếu bảo hành, em gửi phiếu bảo hành điện tử và ngày hết hạn cho anh/chị ạ.`,
      notify: null,
    };
  }

  const greeting = /^(hi|hello|alo|chao|xin chao|shop|ad|admin|e|em|a|anh|chi|ok|oke|cam on|thanks)( .*)?$/.test(t) || t.length < 4;
  return {
    reply:
      `🍎 Dạ, ${SHOP.name} xin chào anh/chị!\nCảm ơn anh/chị đã ghé nhà Táo ❤️\n\n` +
      `Anh/chị cần mua máy, sửa máy hay lên đời, cứ nhắn ngay tại đây, bên em sẵn sàng tư vấn ạ!\n\n` +
      `Để được hỗ trợ đúng nhu cầu, anh/chị có thể nhắn:\n` +
      `🔧 Ví dụ Giá sửa: “Thay pin 12 Pro Max”\n📱 Ví dụ Giá máy: “Giá 17 Pro Max 256GB”\n🔄 Ví dụ Lên đời: “Đổi 12 Pro Max lên 17 Pro Max”\n🛡️ Tra cứu bảo hành: “Bảo hành”\n\n` +
      `📍 296 Lê Văn Thọ, TP. Hồ Chí Minh\n⏰ Giờ mở cửa: 8h – 21h\n📞 0981.308.308 – 0909.06.7474\n\nAnh/chị đang cần hỗ trợ gì, nhắn em nhé! 😊`,
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
  // Giữ các trường khác (điểm tích lũy, voucher) khi cập nhật
  const meta = { ...(old || {}), n: name || '', f: old ? old.f : now, l: now, off: old ? !!old.off : false, ...(patch || {}) };
  await env.DB.put(key, '', { metadata: meta });
}

async function countCustomers(env) {
  let cursor, total = 0, off = 0, oa = 0;
  do {
    const page = await env.DB.list({ prefix: 'c:', cursor });
    const bot = page.keys.filter((k) => !isOa(k.name.slice(2))); // khách OA đếm riêng, không nhận khuyến mãi từ bot
    oa += page.keys.length - bot.length;
    total += bot.length;
    off += bot.filter((k) => k.metadata && k.metadata.off).length;
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { total, off, oa };
}

function promoMessage(text) {
  return `🔥 ${SHOP.name.toUpperCase()} KHUYẾN MÃI\n\n${text}\n\n📞 ${SHOP.phone} | ${SHOP.address}\n(Nhắn "huy km" để ngừng nhận tin khuyến mãi)`;
}

// Cloudflare chặn webhook của Zalo trên tên miền workers.dev, nên mỗi phút bot tự lấy tin mới (getUpdates).
// Mỗi lần gọi trả về 1 tin; Zalo giữ kết nối tối đa 10 giây nếu chưa có tin. Trả về số lệnh gọi ra ngoài đã dùng.
async function pollUpdates(env, budget) {
  const until = Date.now() + 50000;
  let used = 0;
  while (Date.now() < until && used + 3 <= budget) {
    const started = Date.now();
    const r = await callApi(env, 'getUpdates', { timeout: '10' });
    used++;
    if (r && r.ok && r.result) {
      used += 4; // tối đa: phiếu bảo hành + voucher + báo 2 người quản trị
      await onUpdate(env, r.result).catch((e) => console.error(e));
    } else if (Date.now() - started < 8000) {
      // Lỗi trả về ngay (không phải hết giờ chờ): dừng, tránh gọi dồn dập
      console.log('getUpdates', JSON.stringify(r));
      break;
    }
  }
  return used;
}

// Chạy mỗi phút (cron): gửi khuyến mãi cho tối đa `limit` khách tiếp theo
async function runBroadcast(env, limit) {
  if (!env.DB || limit < 1) return;
  // Chỉ gửi khuyến mãi 8h-21h giờ Việt Nam (luật chỉ cho 7h-22h); ngoài giờ thì đợi sáng hôm sau gửi tiếp
  const hourVN = (new Date().getUTCHours() + 7) % 24;
  if (hourVN < 8 || hourVN >= 21) return;
  const job = await env.DB.get('bc', 'json');
  if (!job) return;
  const page = await env.DB.list({ prefix: 'c:', cursor: job.cursor || undefined, limit });
  for (const k of page.keys) {
    if ((k.metadata && k.metadata.off) || isOa(k.name.slice(2))) continue; // khách OA: gửi khuyến mãi qua KiotViet
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

// Mẫu khuyến mãi soạn sẵn. Chủ tiệm nhắn /km <số> (VD: /km 4) hoặc gộp nhiều mẫu: /km 4 5 6
const PROMO_PRESETS = [
  // Nhóm 1: Mua máy mới / Lên đời máy
  ['Thu cũ đổi mới', '🔄 THU CŨ ĐỔI MỚI – TRỢ GIÁ KHỦNG\nThu lại máy cũ giá cao, trợ giá ngay 300.000đ – 500.000đ khi lên đời máy mới.'],
  ['Quà tặng kèm', '🎁 MUA MÁY MỚI – QUÀ TẶNG GIÁ TRỊ\nMua điện thoại mới tặng ngay ốp lưng, cường lực trọn đời, củ sạc nhanh chính hãng hoặc tai nghe Bluetooth.'],
  ['Trả góp 0%', '💳 TRẢ GÓP 0%\nKhông cần trả trước, thủ tục nhanh gọn trong 15 phút (chỉ cần CCCD).'],
  // Nhóm 2: Sửa chữa & Thay linh kiện
  ['Giảm giá sửa chữa', '🔧 GIẢM GIÁ SỬA CHỮA\nGiảm ngay 20% tiền công sửa chữa hoặc giảm 100.000đ khi thay màn hình/pin.'],
  ['Bảo hành mở rộng', '🛡️ BẢO HÀNH MỞ RỘNG\nBảo hành sửa chữa lên đến 6 – 12 tháng, 1 đổi 1 trong 30 ngày đầu.'],
  ['Miễn phí đi kèm', '✨ MIỄN PHÍ ĐI KÈM KHI SỬA MÁY\nMiễn phí vệ sinh máy, dán cường lực và kiểm tra tổng quát toàn bộ máy khi đến sửa chữa.'],
  // Nhóm 3: Khách thân thiết / Khách mới
  ['Check-in giảm giá', '📍 CHECK-IN NHẬN QUÀ\nGiảm ngay 100.000đ hoặc tặng 1 nón bảo hiểm khi check-in tiệm lên Facebook/Google Maps.'],
  ['Giờ vàng cuối tuần', '⏰ GIỜ VÀNG – NGÀY HỘI THÀNH VIÊN\nGiảm ngay 200.000đ vào cuối tuần (Thứ 7, Chủ nhật) và khung giờ vàng 12h00 mỗi ngày.'],
  // Học Điện Thoại Vui: khuyến khích đặt lịch trước để tiệm chủ động linh kiện, khách không phải chờ
  ['Đặt lịch trước', '📅 ĐẶT LỊCH TRƯỚC – GIẢM 10%\nĐặt lịch sửa qua Zalo hoặc website, giảm ngay 10% tiền công (tối đa 100.000đ). Không áp dụng cùng ưu đãi khác.'],
];

// Mẫu sửa trên trang /admin được lưu ở KV "presets", chưa sửa thì dùng mẫu gốc ở trên
async function getPresets(env) {
  return (env.DB && (await env.DB.get('presets', 'json'))) || PROMO_PRESETS;
}

function presetList(list) {
  return list.map(([name, body], i) => `${i + 1}. ${name}: ${body.split('\n')[1] || body}`).join('\n');
}

// Lưu khuyến mãi (bot kèm khi trả lời giá) và bắt đầu gửi cho tất cả khách đã nhắn bot
async function startBroadcast(env, promo) {
  await env.DB.put('promo', promo.slice(0, 1500));
  await env.DB.put('bc', JSON.stringify({ text: promo.slice(0, 1500), cursor: null, sent: 0, failed: 0 }));
  const { total, off } = await countCustomers(env);
  return total - off;
}

// --- Phiếu bảo hành điện tử & tự nhắc khách sau sửa ---
// Mỗi khách đã nhận máy là 1 key "f:<chatId>", metadata: n tên, m máy, d ngày nhận (ms), s số mốc nhắc đã gửi.

const DAY = 86400000;
const WARRANTY_WORDS = /^(kich hoat|kich hoat bao hanh|nhan may|da nhan may)( |$)/;
const STOP_REMIND_WORDS = /^(huy nhac|tat nhac)$/;
const LOOKUP_WORDS = /^(tra cuu bao hanh|tra cuu|phieu bao hanh|xem bao hanh)$/;
const WARRANTY_MONTHS = 6; // mặc định khi không ghi số tháng
const MAX_CARDS = 10; // số phiếu giữ lại cho mỗi khách

const vnDayStart = (ts) => Math.floor((ts + 7 * 3600000) / DAY) * DAY;
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(ts) {
  const d = new Date(vnDayStart(ts));
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
// Ngày hết bảo hành: cùng ngày sau `mo` tháng (giờ VN)
function addMonths(ts, mo) {
  const d = new Date(vnDayStart(ts));
  d.setUTCMonth(d.getUTCMonth() + mo);
  return d.getTime() - 7 * 3600000;
}
// "iPhone 13 thay pin 12t" => { m: "iPhone 13 thay pin", mo: 12 }
function parseJob(raw) {
  const re = /(?:^|\s+)(?:(?:bh|bảo hành|bao hanh)\s*)?(\d{1,2})\s*(?:t|th|thg|tháng|thang)\.?\s*$/i;
  const x = String(raw || '').match(re);
  const mo = x && +x[1] >= 1 && +x[1] <= 36 ? +x[1] : WARRANTY_MONTHS;
  return { m: String(raw || '').replace(x ? re : /$^/, '').trim(), mo };
}

// [số ngày sau khi nhận máy, nội dung tin]
const FOLLOWUPS = [
  [7, (r) => `Dạ ${SHOP.name} xin chào anh/chị${r.n ? ' ' + r.n : ''} ạ! Máy ${r.m || 'của anh/chị'} sửa tại tiệm mình dùng có ổn định không ạ? Nếu có gì bất thường, anh/chị nhắn em ngay để bên em hỗ trợ ạ.\nNếu anh/chị hài lòng, anh/chị đánh giá giúp tiệm trên Google Maps với ạ. Em cảm ơn anh/chị nhiều! 🙏`],
  [27, (r) => `⏰ Dạ em xin nhắc anh/chị: máy ${r.m || 'của anh/chị'} còn 3 ngày nữa là hết hạn 1 đổi 1 (đến ${fmtDate(r.d + 30 * DAY)}) ạ. Nếu máy có lỗi gì, anh/chị ghé ${SHOP.name} để bên em kiểm tra miễn phí trước ngày này ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone}`],
  [180, (r) => `🔧 Dạ đã 6 tháng từ lần anh/chị sửa máy ${r.m || ''} tại ${SHOP.name} ạ. Bên em kính mời anh/chị ghé vệ sinh máy và kiểm tra pin, chẩn đoán máy miễn phí ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone} | ${SHOP.hours}`],
];

// Hai loại phiếu (thầy dặn): phiếu SỬA MÁY và phiếu MUA MÁY, cùng thứ tự
// 1 Tên khách hàng, 2 Số điện thoại, 3 Tên máy, 4 Ngày sửa / Ngày mua, 5 Thời gian bảo hành, rồi đến tích điểm.
// Mua máy: có chữ mua/bán/máy mới/lên đời..., hoặc chỉ ghi máy + dung lượng mà không có dịch vụ sửa. Còn lại là sửa máy.
function isPurchase(m) {
  const t = norm(m);
  if (/(^| )(mua|ban|ban may|may moi|new|seal|like new|99|98|len doi|doi may)( |$)/.test(t)) return true;
  return /(^| )\d+ ?(gb|g|tb)( |$)/.test(t) && !findService(t);
}

// "Thay Pin 15 pro max" => "iPhone 15 Pro Max (Thay Pin)"; "Mua 16 pro max 256GB" => "iPhone 16 Pro Max 256GB".
// Không nhận ra máy (iPad, máy khác) thì giữ nguyên chữ thầy ghi.
function deviceName(m, buy) {
  const text = (m || '').replace(buy ? /(^|\s)(mua|bán|ban)(?=\s|$)/gi : /$^/, ' ').replace(/\s+/g, ' ').trim();
  const dev = findDevice(norm(text));
  if (!dev || dev.startsWith('iPad')) return text || '(chưa ghi)';
  const rest = text
    .replace(/(?:^|\s)(?:iphone|ip)?\s*(?:xs\s*max|xs|xr|x|6s\s*plus|[6-8]\s*plus|\d{1,2}e?)\s*(?:pro\s*max|promax|prm|pm|pro|plus|air|mini)?(?=\s|$)/i, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[-–,;:\s]+|[-–,;:\s]+$/g, '');
  if (!rest) return dev;
  return buy ? `${dev} ${rest}` : `${dev} (${rest})`;
}

// Mục 3 – 5 của 1 phiếu (phiếu cũ không có mo thì ghi chung 6 – 12 tháng)
function cardBody(r, now) {
  const buy = isPurchase(r.m);
  const end = r.mo ? addMonths(r.d, r.mo) : 0;
  let status = '';
  if (now && end) {
    const left = Math.ceil((vnDayStart(end) - vnDayStart(now)) / DAY);
    status = left >= 0 ? ` (còn ${left} ngày)` : ' (đã hết hạn)';
  }
  return (
    `3. Tên máy: ${deviceName(r.m, buy)}\n` +
    `4. ${buy ? 'Ngày mua' : 'Ngày sửa'}: ${fmtDate(r.d)}\n` +
    `5. Thời gian bảo hành: ${end ? `${r.mo} tháng, đến hết ${fmtDate(end)}${status}` : '6 – 12 tháng tùy linh kiện'}` +
    (buy ? '' : `\n    • 1 đổi 1 đến hết ${fmtDate(r.d + 30 * DAY)}`)
  );
}

// Phiếu gửi khách: mục 1 – 5, tiếp đến tích điểm (s = kết quả addStamp)
function warrantyCard(r, s) {
  return (
    `🛡️ PHIẾU BẢO HÀNH ${isPurchase(r.m) ? 'MUA MÁY' : 'SỬA MÁY'} – ${SHOP.name.toUpperCase()}\n` +
    `1. Tên khách hàng: ${r.n || '(chưa ghi)'}\n2. Số điện thoại: ${r.ph || '(chưa ghi)'}\n${cardBody(r)}` +
    (s ? `\n\n${stampLine(s)}` : '') +
    `\n\nNhắn "bảo hành" để xem lại phiếu. 📞 ${SHOP.phone}` +
    (r.oa || isPurchase(r.m) ? '' : `\nBên em sẽ hỏi thăm sau 7 ngày và nhắc trước khi hết hạn 1 đổi 1 (nhắn "huy nhac" nếu không muốn nhận).`)
  );
}

// Khách tra cứu: liệt kê các phiếu đã lưu, mới nhất trước
function lookupCards(list, name, phone) {
  const now = Date.now();
  return (
    `🛡️ PHIẾU BẢO HÀNH – ${SHOP.name.toUpperCase()}\n1. Tên khách hàng: ${name || '(chưa ghi)'}\n2. Số điện thoại: ${phone || '(chưa ghi)'}\n\n` +
    list.map((r) => `${isPurchase(r.m) ? '📱 PHIẾU MUA MÁY' : '🔧 PHIẾU SỬA MÁY'}\n${cardBody(r, now)}`).join('\n\n') +
    `\n\nDạ máy có gì bất thường, anh/chị mang qua tiệm để bên em kiểm tra miễn phí ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone}`
  );
}

// Phiếu lưu lâu dài ở "w:<chatId>" (JSON, mới nhất trước); "f:<chatId>" chỉ dùng cho lịch nhắc và bị xóa sau 6 tháng
async function getCards(env, chatId) {
  const list = (await env.DB.get(`w:${chatId}`, 'json')) || [];
  if (list.length) return list;
  const { metadata: f } = await env.DB.getWithMetadata(`f:${chatId}`); // phiếu tạo trước khi có w:
  return f ? [{ m: f.m, d: f.d }] : [];
}

// Lưu phiếu mới + (làm mới) lịch nhắc cho khách, trả về bản ghi
async function registerWarranty(env, chatId, name, model, months, day) {
  const r = { n: (name || '').slice(0, 60), m: (model || '').slice(0, 80), d: day || Date.now(), s: 0, mo: months || WARRANTY_MONTHS };
  const { metadata: cust } = await env.DB.getWithMetadata(`c:${chatId}`);
  if (cust && cust.ph) r.ph = cust.ph; // in SĐT khách trên phiếu
  const list = await getCards(env, chatId); // đọc trước khi ghi f: để phiếu mới không bị tính 2 lần
  // Khách OA: chỉ trả lời miễn phí trong 48h sau khi khách nhắn, nên không đặt lịch tự nhắc
  // Phiếu mua máy cũng không đặt lịch nhắc: tin nhắc viết cho khách sửa máy
  if (isOa(chatId)) r.oa = true;
  else if (!isPurchase(r.m)) await env.DB.put(`f:${chatId}`, '', { metadata: r });
  await env.DB.put(`w:${chatId}`, JSON.stringify([{ m: r.m, d: r.d, mo: r.mo }, ...list].slice(0, MAX_CARDS)));
  return r;
}

// Phiếu thầy ghi theo SĐT khi khách chưa nhắn bot: chờ ở "p:<SĐT>", khách nhắn SĐT đó thì bot gửi phiếu
async function savePending(env, phone, model, months, name) {
  const list = (await env.DB.get(`p:${phone}`, 'json')) || [];
  await env.DB.put(`p:${phone}`, JSON.stringify([{ m: model.slice(0, 80), d: Date.now(), mo: months, n: name || '' }, ...list].slice(0, MAX_CARDS)));
}

async function deliverPending(env, chatId, name, phone) {
  const list = await env.DB.get(`p:${phone}`, 'json');
  if (!list || !list.length) return false;
  let r;
  for (const it of [...list].reverse()) r = await registerWarranty(env, chatId, it.n || name, it.m, it.mo, it.d); // cũ trước, mới sau; tên thầy ghi trên phiếu được ưu tiên
  await env.DB.delete(`p:${phone}`);
  const s = await addStamp(env, chatId, name);
  await send(env, chatId, warrantyCard(r, s));
  if (s.voucher) await send(env, chatId, voucherMessage(s.voucher));
  await notifyOwner(env, `🛡️ Khách ${name || ''} (${phone}) đã nhận phiếu bảo hành điện tử: ${r.m}.\nMã khách: ${chatId}`);
  return true;
}

// Tìm mã khách theo SĐT khách đã nhắn bot (lưu ở c:<chatId>.ph)
async function findByPhone(env, phone) {
  let cursor;
  do {
    const page = await env.DB.list({ prefix: 'c:', cursor });
    const k = page.keys.find((x) => x.metadata && x.metadata.ph === phone);
    if (k) return k.name.slice(2);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return null;
}

// --- Tích điểm khách quen (học Viettel++, Quà Tặng VIP) ---
// Mỗi lần nhận máy +1 điểm, lưu ở metadata khách: p điểm, ps lần cộng điểm gần nhất, vc mã voucher đang có.
// Tối đa 1 điểm/7 ngày để không ai nhắn "nhận máy" nhiều lần lấy điểm.
// Đủ STAMPS_NEEDED điểm => voucher, key "v:<MÃ>" metadata: c chatId, d ngày tạo, u ngày dùng (0 = chưa dùng).
const STAMPS_NEEDED = 3;
const REWARD = 'giảm 100.000đ tiền công lần sửa kế tiếp';
const VOUCHER_DAYS = 180;
const POINT_WORDS = /^(diem|xem diem|tich diem|diem cua toi|voucher)$/;

async function addStamp(env, chatId, name) {
  const key = `c:${chatId}`;
  const now = Date.now();
  const { metadata: old } = await env.DB.getWithMetadata(key);
  const c = old || { n: name || '', f: now, off: false };
  if (c.ps && now - c.ps < 7 * DAY) return { p: c.p || 0, skipped: true };
  let p = (c.p || 0) + 1;
  let voucher = null;
  if (p >= STAMPS_NEEDED) {
    voucher = 'KH' + Math.random().toString(36).slice(2, 7).toUpperCase();
    await env.DB.put(`v:${voucher}`, '', { metadata: { c: chatId, d: now, u: 0 } });
    p = 0;
  }
  await env.DB.put(key, '', { metadata: { ...c, n: name || c.n || '', l: now, p, ps: now, ...(voucher ? { vc: voucher } : {}) } });
  return { p, voucher };
}

function stampLine(s) {
  if (s.voucher) return `⭐ Tích điểm: đủ ${STAMPS_NEEDED}/${STAMPS_NEEDED} lần mua/sửa – dạ anh/chị được tặng voucher ạ!`;
  return `⭐ Tích điểm: ${s.p}/${STAMPS_NEEDED} lần mua/sửa. Dạ đủ ${STAMPS_NEEDED} lần anh/chị được ${REWARD} ạ.`;
}

function voucherMessage(code) {
  return (
    `🎁 VOUCHER KHÁCH QUEN – ${SHOP.name.toUpperCase()}\n` +
    `Dạ em cảm ơn anh/chị đã tin tưởng sửa máy ${STAMPS_NEEDED} lần tại tiệm ạ!\n` +
    `Mã: ${code}\nƯu đãi: ${REWARD}\nHạn dùng: đến ${fmtDate(Date.now() + VOUCHER_DAYS * DAY)}\n` +
    `Anh/chị đưa mã này cho nhân viên khi đến sửa giúp em ạ (nhắn "diem" để xem lại).`
  );
}

async function pointsInfo(env, chatId) {
  const { metadata: c } = await env.DB.getWithMetadata(`c:${chatId}`);
  let text = `⭐ Điểm khách quen: ${(c && c.p) || 0}/${STAMPS_NEEDED} lần sửa.\nMỗi lần sửa máy tại ${SHOP.name} được 1 điểm, đủ ${STAMPS_NEEDED} điểm tặng voucher ${REWARD}.`;
  if (c && c.vc) {
    const { metadata: v } = await env.DB.getWithMetadata(`v:${c.vc}`);
    if (v && !v.u && Date.now() < v.d + VOUCHER_DAYS * DAY) {
      text += `\n\n🎁 Voucher đang có: ${c.vc} (${REWARD}, hạn đến ${fmtDate(v.d + VOUCHER_DAYS * DAY)}).`;
    }
  }
  return text;
}

// Mỗi ngày 9h-20h giờ VN chạy 1 lượt: gửi mốc nhắc đến hạn. Trả về số tin đã gửi.
async function runFollowups(env, limit) {
  if (!env.DB || limit < 1) return 0;
  const now = Date.now();
  const hourVN = (new Date(now).getUTCHours() + 7) % 24;
  if (hourVN < 9 || hourVN >= 20) return 0;
  const today = vnDayStart(now);
  const state = (await env.DB.get('fu', 'json')) || {};
  if (state.day === today && !state.cursor) return 0;
  const page = await env.DB.list({ prefix: 'f:', cursor: (state.day === today && state.cursor) || undefined, limit });
  let used = 0;
  for (const k of page.keys) {
    const r = k.metadata;
    if (!r) continue;
    const days = Math.floor((today - vnDayStart(r.d)) / DAY);
    // Chỉ gửi mốc muộn nhất đã đến hạn (nếu bot ngừng lâu thì bỏ qua mốc cũ, không gửi dồn)
    let due = -1;
    FOLLOWUPS.forEach(([day], i) => {
      if (i >= r.s && days >= day) due = i;
    });
    if (due < 0) continue;
    await send(env, k.name.slice(2), FOLLOWUPS[due][1](r));
    used++;
    if (due === FOLLOWUPS.length - 1) await env.DB.delete(k.name);
    else await env.DB.put(k.name, '', { metadata: { ...r, s: due + 1 } });
  }
  await env.DB.put('fu', JSON.stringify(page.list_complete ? { day: today } : { day: today, cursor: page.cursor }));
  return used;
}

// --- Chúc mừng sinh nhật ---
// "b:<chatId>" metadata { d: 'dd/mm', n: tên, y: năm đã chúc, ph }; SĐT chưa nhắn bot thì chờ ở "bp:<SĐT>" = 'dd/mm'
// Lời chúc sửa được trên trang /admin (KV "bday"), {ten} được thay bằng tên Zalo của khách.
const BDAY_TEXT =
  `🎂 Dạ ${SHOP.name} chúc anh/chị {ten} sinh nhật thật vui, nhiều sức khỏe và may mắn ạ!\n` +
  `Nhân dịp sinh nhật, bên em tặng anh/chị ưu đãi giảm 100.000đ khi sửa máy hoặc mua máy trong 7 ngày tới. Anh/chị đưa tin nhắn này cho nhân viên khi thanh toán giúp em ạ.\n📞 ${SHOP.phone}`;

async function getBday(env) {
  return { on: true, text: BDAY_TEXT, ...((await env.DB.get('bday', 'json')) || {}) };
}

function bdayMessage(cfg, name) {
  return cfg.text.replace(/\{ten\}/g, name || '').replace(/ {2,}/g, ' ');
}

// "15/8", "15-08-1990", "15 8" => "15/08"
function parseDayMonth(s) {
  const m = String(s || '').match(/(\d{1,2})\s*[/.\- ]\s*(\d{1,2})/);
  if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) return null;
  return `${pad(+m[1])}/${pad(+m[2])}`;
}

async function saveBirthday(env, phone, dm) {
  const id = await findByPhone(env, phone);
  if (!id) {
    await env.DB.put(`bp:${phone}`, dm);
    return false;
  }
  const { metadata: c } = await env.DB.getWithMetadata(`c:${id}`);
  const { metadata: old } = await env.DB.getWithMetadata(`b:${id}`);
  await env.DB.put(`b:${id}`, '', { metadata: { d: dm, n: (c && c.n) || '', y: old && old.d === dm ? old.y : 0, ph: phone } });
  return true;
}

async function claimBirthday(env, chatId, name, phone) {
  const dm = await env.DB.get(`bp:${phone}`);
  if (!dm) return;
  await env.DB.put(`b:${chatId}`, '', { metadata: { d: dm, n: name || '', y: 0, ph: phone } });
  await env.DB.delete(`bp:${phone}`);
}

// Mỗi ngày 9h-20h giờ VN: chúc khách có sinh nhật hôm nay (mỗi năm 1 lần). Trả về số tin đã gửi.
async function runBirthdays(env, limit) {
  if (!env.DB || limit < 1) return 0;
  const now = Date.now();
  const hourVN = (new Date(now).getUTCHours() + 7) % 24;
  if (hourVN < 9 || hourVN >= 20) return 0;
  const today = vnDayStart(now);
  const state = (await env.DB.get('bdst', 'json')) || {};
  if (state.day === today && !state.cursor) return 0;
  const cfg = await getBday(env);
  if (!cfg.on) return 0;
  const dm = fmtDate(now).slice(0, 5);
  const year = new Date(today).getUTCFullYear();
  const cursor = (state.day === today && state.cursor !== '*' && state.cursor) || undefined; // '*' = đọc lại từ đầu
  const page = await env.DB.list({ prefix: 'b:', cursor, limit: 500 });
  let used = 0;
  for (const k of page.keys) {
    const b = k.metadata;
    if (!b || b.d !== dm || b.y === year || isOa(k.name.slice(2))) continue;
    if (used >= limit) {
      // Hết lượt gọi phút này: phút sau đọc lại trang này, khách đã chúc có y = năm nay nên được bỏ qua
      await env.DB.put('bdst', JSON.stringify({ day: today, cursor: cursor || '*' }));
      return used;
    }
    await send(env, k.name.slice(2), bdayMessage(cfg, b.n));
    await env.DB.put(k.name, '', { metadata: { ...b, y: year } });
    used++;
  }
  await env.DB.put('bdst', JSON.stringify(page.list_complete ? { day: today } : { day: today, cursor: page.cursor }));
  return used;
}

const OWNER_HELP =
  'Chào chủ tiệm 👋\n' +
  '• /kmmau: xem các mẫu khuyến mãi soạn sẵn\n' +
  '• /km <số>: gửi mẫu đó cho TẤT CẢ khách (VD: /km 4, gộp nhiều mẫu: /km 4 5 6)\n' +
  '• /km <nội dung>: gửi khuyến mãi tự soạn cho TẤT CẢ khách + bot tự kèm khi trả lời giá\n' +
  '• /kmxem: xem khuyến mãi đang chạy\n' +
  '• /kmxoa: tắt khuyến mãi\n' +
  '• /khach: đếm số khách\n' +
  '• /giao <Tên khách> <SĐT> <máy + dịch vụ> <số tháng>t: gửi phiếu bảo hành + bật tự nhắc (VD: /giao Thuý Trần 0909123456 iPhone 13 thay pin 6t). Khách chưa nhắn bot thì bot giữ phiếu, khách nhắn SĐT là nhận\n' +
  '• /nhac: đếm khách đang được tự nhắc sau sửa\n' +
  '• /dung <mã voucher>: kiểm tra và đánh dấu voucher khách quen đã dùng\n' +
  '• /diem <mã khách>: xem điểm tích lũy của khách\n' +
  '• /tl <chat_id> <nội dung>: trả lời 1 khách\n' +
  '• /sn <SĐT> <ngày/tháng>: lưu sinh nhật khách để bot tự chúc (VD: /sn 0909123456 15/8)\n' +
  '• /admin: xem, thêm, bỏ người quản trị bot (VD: /admin 0909067474)\n' +
  'Trang quản lý (soạn khuyến mãi, lời chúc sinh nhật): khanghuyapple-bot.crimson-recipe-0ba6.workers.dev/admin\n' +
  'Các tin báo đơn sẽ gửi về đây.';

async function onOwner(env, chatId, text) {
  const reply = (s) => send(env, chatId, s);
  // Gõ trên điện thoại hay dính ngoặc, dấu + hoặc dấu phẩy: "(/giao+0937…, iPhone…" => "/giao 0937… iPhone…"
  text = text.replace(/^[\s("'“]+/, '').replace(/^\/giao[\s+:,]*/i, '/giao ').trim();
  // "/giao Thuý Trần - 0909067474 iPhone 15 Pro Max thay pin 12t": tách tên khách đứng trước SĐT
  let givenName = '';
  const named = text.match(/^\/giao\s+([^\d+\s][^\n]*?)[\s,;:-]*((?:\+?84|0)(?:[ .-]?\d){9})(?!\d)[\s,;:-]*([\s\S]*)$/);
  if (named) {
    givenName = named[1].trim();
    text = `/giao ${named[2].replace(/[^\d+]/g, '')} ${named[3]}`.trim();
  }
  const m = text.match(/^\/tl\s+(\S+)\s+([\s\S]+)/);
  if (m) {
    const r = await send(env, m[1], m[2]);
    return reply(r && r.ok ? '✅ Đã gửi cho khách.' : `❌ Gửi lỗi: ${JSON.stringify(r)}`);
  }
  if (!/^\/(km|kmmau|kmxem|kmxoa|khach|giao|nhac|dung|diem|admin|sn)\b/.test(text)) return reply(OWNER_HELP);
  if (!env.DB) return reply('❌ Chưa gắn KV "DB" cho worker, xem Bước 5 trong hướng dẫn.');
  const presets = await getPresets(env);
  if (text === '/kmmau') {
    return reply(`📋 MẪU KHUYẾN MÃI SOẠN SẴN\n\n${presetList(presets)}\n\nGửi cho tất cả khách: /km <số>\nVD: /km 4 hoặc gộp /km 4 5 6\nSửa mẫu: trang /admin`);
  }
  const sn = text.match(/^\/sn\s+([\d.+\s-]{9,15}?)\s+(\d{1,2}\s*[/.-]\s*\d{1,2})/);
  if (sn) {
    const ph = (findPhone(sn[1]) || '').replace(/^\+?84/, '0');
    const dm = parseDayMonth(sn[2]);
    if (!ph || !dm) return reply('Gõ: /sn <SĐT> <ngày/tháng>\nVD: /sn 0909123456 15/8');
    return reply((await saveBirthday(env, ph, dm))
      ? `🎂 Đã lưu sinh nhật ${dm} cho khách ${ph}. Đến ngày bot tự gửi lời chúc.`
      : `🎂 Đã lưu sinh nhật ${dm} cho SĐT ${ph}. Khách chưa nhắn bot, khi khách nhắn SĐT này bot sẽ ghi nhận và chúc đúng ngày.`);
  }
  if (/^\/sn\b/.test(text)) return reply('Gõ: /sn <SĐT> <ngày/tháng>\nVD: /sn 0909123456 15/8');
  // /admin: xem; /admin 0909067474: thêm; /admin xoa 0909067474: bỏ
  const ad = text.match(/^\/admin\s*(xoa|xóa)?\s*([\d.+\s-]*)$/i);
  if (ad) {
    const ph = (findPhone(ad[2]) || '').replace(/^\+?84/, '0');
    if (ad[1] && ph) return reply((await removeAdmin(env, ph)) ? `✅ Đã bỏ quyền quản trị của ${ph}.` : `Không có admin ${ph}.`);
    if (ph) {
      const a = await addAdmin(env, ph);
      return reply(a.id
        ? `✅ Đã thêm ${a.n || ph} (${ph}) làm quản trị bot. Người này nhận tin báo đơn và dùng được các lệnh.`
        : `✅ Đã lưu ${ph} làm quản trị. Nhờ người đó vào bot nhắn số ${ph} là có quyền ngay.`);
    }
    const list = await getAdmins(env);
    return reply(`👤 QUẢN TRỊ BOT\n• Chủ tiệm (chat id ${env.OWNER_CHAT_ID})\n` +
      list.map((a) => `• ${a.n || ''} ${a.ph}${a.id ? '' : ' (chờ nhắn SĐT)'}`).join('\n') +
      `\n\nThêm: /admin 0909067474\nBỏ: /admin xoa 0909067474`);
  }

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
  const u = text.match(/^\/dung\s+(\S+)/);
  if (u) {
    const code = u[1].toUpperCase();
    const { metadata: v } = await env.DB.getWithMetadata(`v:${code}`);
    if (!v) return reply(`❌ Không có voucher ${code}. Kiểm tra lại mã khách đưa.`);
    if (v.u) return reply(`❌ Voucher ${code} đã dùng ngày ${fmtDate(v.u)}.`);
    if (Date.now() > v.d + VOUCHER_DAYS * DAY) return reply(`❌ Voucher ${code} đã hết hạn ngày ${fmtDate(v.d + VOUCHER_DAYS * DAY)}.`);
    await env.DB.put(`v:${code}`, '', { metadata: { ...v, u: Date.now() } });
    const { metadata: c } = await env.DB.getWithMetadata(`c:${v.c}`);
    if (c && c.vc === code) {
      const { vc, ...rest } = c;
      await env.DB.put(`c:${v.c}`, '', { metadata: rest });
    }
    await send(env, v.c, `✅ Dạ voucher ${code} đã được áp dụng hôm nay ạ. Em cảm ơn anh/chị đã tin tưởng ủng hộ ${SHOP.name} ạ!`);
    return reply(`✅ Voucher ${code} hợp lệ, đã đánh dấu đã dùng.\nÁp dụng cho khách: ${REWARD}.`);
  }
  const dm = text.match(/^\/diem\s+(\S+)/);
  if (dm) return reply(`Khách ${dm[1]}:\n${await pointsInfo(env, dm[1])}`);
  if (/^\/(dung|diem)\b/.test(text)) return reply('Gõ: /dung <mã voucher> (VD: /dung KHAB12C)\nhoặc /diem <mã khách> để xem điểm của khách.');
  if (text === '/nhac') {
    let cursor, total = 0;
    do {
      const page = await env.DB.list({ prefix: 'f:', cursor });
      total += page.keys.length;
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return reply(`Có ${total} khách đang được tự nhắc sau sửa máy.`);
  }
  const g = text.match(/^\/giao\s+([^\s,;]+)[\s,;]*([\s\S]*)/);
  if (g) {
    // Thầy gõ SĐT khách (0909.123.456) hoặc mã khách trong tin báo đơn
    const digits = g[1].replace(/[^\d]/g, '').replace(/^84/, '0');
    let id = g[1];
    if (!g[2].replace(/[\s)"”.,;]/g, '')) {
      return reply(`❌ Thầy ghi thêm tên máy + dịch vụ + số tháng bảo hành giúp em.\nVD: /giao ${digits || '0909123456'} iPhone 13 thay pin 6t`);
    }
    const job = parseJob(g[2].replace(/[\s)"”.,;]+$/, ''));
    const jt = norm(job.m);
    if (!findDevice(jt) && !/(^| )(iphone|ipad|ip|apple|samsung|ss|oppo|xiaomi|redmi|vivo|realme|watch|airpods?|macbook|mac|dien thoai|may)( |$)/.test(jt)) {
      return reply(`❌ Em chưa thấy tên máy trong "${job.m}".\nThầy gõ lại theo mẫu: /giao ${digits || '0909123456'} iPhone 13 thay pin 6t`);
    }
    if (/^[\d.+-]+$/.test(g[1]) && /^0\d{9,10}$/.test(digits)) {
      id = await findByPhone(env, digits);
      if (!id) {
        await savePending(env, digits, job.m, job.mo, givenName);
        return reply(
          `✅ Đã lưu phiếu cho SĐT ${digits}: ${job.m}, bảo hành ${job.mo} tháng đến hết ${fmtDate(addMonths(Date.now(), job.mo))}.\n` +
          `Khách chưa nhắn bot, nên khi khách vào bot Khang Huy Apple nhắn số ${digits}, bot sẽ tự gửi phiếu cho khách.`);
      }
    }
    const { metadata: c } = await env.DB.getWithMetadata(`c:${id}`);
    const custName = givenName || (c && c.n);
    if (givenName) await saveCustomer(env, id, givenName, {});
    const r = await registerWarranty(env, id, custName, job.m, job.mo);
    const s = await addStamp(env, id, custName);
    const sent = await send(env, id, warrantyCard(r, s));
    if (sent && sent.ok && s.voucher) await send(env, id, voucherMessage(s.voucher));
    const pts = s.voucher ? `đủ ${STAMPS_NEEDED}, đã tặng voucher ${s.voucher}` : `${s.p}/${STAMPS_NEEDED}${s.skipped ? ' (không cộng: đã cộng trong 7 ngày qua)' : ''}`;
    return reply(sent && sent.ok
      ? `✅ Đã gửi phiếu bảo hành cho khách ${r.n || id}: ${r.m || '(chưa ghi máy)'}, bảo hành ${r.mo} tháng đến hết ${fmtDate(addMonths(r.d, r.mo))}.\n⭐ Điểm: ${pts}`
      : `❌ Không gửi được cho khách ${g[1]}. Khách phải nhắn bot ít nhất 1 lần.`);
  }
  if (/^\/giao\b/.test(text)) return reply('Gõ: /giao <SĐT khách> <máy + dịch vụ> <số tháng>t\nVD: /giao 0909123456 iPhone 13 thay pin 6t\nKhông ghi số tháng thì tính 6 tháng.');
  let promo = text.replace(/^\/km\s*/, '').trim();
  if (!promo) return reply('Gõ: /km <số mẫu> hoặc /km <nội dung khuyến mãi>\nVD: /km 4 hoặc /km Giảm 20% thay pin đến hết 30/11\nXem mẫu: /kmmau');
  // Chỉ toàn số (VD "4" hoặc "4 5 6") => dùng mẫu soạn sẵn
  if (/^[\d\s,]+$/.test(promo)) {
    const nums = promo.split(/[\s,]+/).filter(Boolean).map(Number);
    const bad = nums.filter((n) => !presets[n - 1]);
    if (bad.length) return reply(`❌ Không có mẫu số ${bad.join(', ')}. Có mẫu từ 1 đến ${presets.length}, xem: /kmmau`);
    promo = [...new Set(nums)].map((n) => presets[n - 1][1]).join('\n\n');
  }
  const count = await startBroadcast(env, promo);
  return reply(`✅ Đã lưu khuyến mãi. Bot đang gửi cho ${count} khách, xong sẽ báo lại (mỗi phút ${BATCH} khách, chỉ gửi 8h-21h).\n\nXem trước tin khách nhận:\n\n${promoMessage(promo)}`);
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
  if (isOa(chatId)) return sendOa(env, String(chatId).slice(3), text);
  return callApi(env, 'sendMessage', { chat_id: String(chatId), text: text.slice(0, 2000) });
}

// --- Zalo OA (Khanghuyapple): khách nhắn OA cũng được bot trả lời ---
// Khách OA mang mã "oa:<user_id>" nên dùng chung mọi tính năng; KV "oa" giữ app_id, secret, token.
// Tin Tư vấn chỉ miễn phí trong 48h sau khi khách nhắn, nên bot chỉ trả lời, không tự gửi khuyến mãi/nhắc/chúc cho khách OA.
const OA_OAUTH = 'https://oauth.zaloapp.com/v4/oa';
const ZALO_SITE_VERIFY = 'HVMR0fBH2JPNnQvhjCmhObREkZIwk65lE3Wo';
// Zalo không vào được tên miền workers.dev (bị chặn ở Cloudflare) nên không xác thực được domain.
// Callback đăng ký với Zalo là trang GitHub Pages (nhánh main), trang đó chuyển tiếp ?code=... về /oa/callback của bot.
const OA_CALLBACK = 'https://duongkhanghuy2020-cell.github.io/kiemtienai/oa/callback/';
const OA_API = 'https://openapi.zalo.me';
const isOa = (chatId) => String(chatId).startsWith('oa:');

async function oaTokens(env, form) {
  const cfg = (await env.DB.get('oa', 'json')) || {};
  const res = await fetch(`${OA_OAUTH}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: cfg.secret || '' },
    body: new URLSearchParams({ app_id: cfg.app_id || '', ...form }),
  });
  const j = await res.json().catch(() => ({}));
  const now = (await env.DB.get('oa', 'json')) || cfg; // đọc lại, không ghi đè token mới hơn
  if (!j.access_token) {
    now.err = `${j.error || res.status} ${j.error_description || j.error_name || ''}`.trim();
    await env.DB.put('oa', JSON.stringify(now));
    return null;
  }
  Object.assign(now, { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (+j.expires_in || 90000) * 1000, err: '' });
  await env.DB.put('oa', JSON.stringify(now));
  return now.access_token;
}

// Access token sống 25 giờ. Chỉ lượt chạy mỗi phút (refresh = true) mới đổi token khi còn dưới 1 giờ,
// vì refresh token chỉ dùng được 1 lần và token cũ hết hiệu lực ngay khi có token mới.
async function oaToken(env, refresh) {
  if (!env.DB) return null;
  const cfg = await env.DB.get('oa', 'json');
  if (!cfg || !cfg.refresh_token) return null;
  if (!refresh || cfg.exp - Date.now() > 3600000) return cfg.access_token;
  return oaTokens(env, { refresh_token: cfg.refresh_token, grant_type: 'refresh_token' });
}

// Header gọi OA API: access_token + appsecret_proof = HMAC-SHA256(access_token, khóa bí mật), dạng hex
async function oaHeaders(env, token) {
  const cfg = (await env.DB.get('oa', 'json')) || {};
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)));
  return { access_token: token, appsecret_proof: Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('') };
}

async function sendOa(env, userId, text) {
  const token = await oaToken(env);
  if (!token) return { ok: false, error: 'OA chưa kết nối' };
  const res = await fetch(`${OA_API}/v3.0/oa/message/cs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await oaHeaders(env, token)) },
    body: JSON.stringify({ recipient: { user_id: userId }, message: { text: text.slice(0, 2000) } }),
  });
  const j = await res.json().catch(() => ({ error: res.status }));
  if (j.error) console.log('oa send', JSON.stringify(j));
  return { ok: j.error === 0, ...j };
}

// Mỗi phút lấy 10 tin gần nhất của OA, xử lý tin mới (cũ trước, mới sau). Trả về số lệnh gọi ra ngoài đã dùng.
// Tin khách gửi (src 1) => trả lời như bot. Tin OA gửi (src 0) bắt đầu "/giao" hoặc "/bh" => ghi phiếu bảo hành cho khách đó.
async function pollOa(env, budget) {
  if (!env.DB || budget < 3) return 0;
  const token = await oaToken(env, true);
  if (!token) return 0;
  // Đã nhận tin qua webhook trong 1 ngày qua thì không cần tự đọc tin nữa (chỉ giữ việc đổi token)
  if (Date.now() - (+(await env.DB.get('oa:hook')) || 0) < 86400000) return 1;
  const res = await fetch(`${OA_API}/v2.0/oa/listrecentchat?data=${encodeURIComponent(JSON.stringify({ offset: 0, count: 10 }))}`, {
    headers: await oaHeaders(env, token),
  });
  const j = await res.json().catch(() => ({}));
  if (j.error || !Array.isArray(j.data)) {
    console.log('oa list', JSON.stringify(j));
    return 1;
  }
  const last = +(await env.DB.get('oa:last')) || 0;
  const fresh = j.data.filter((m) => +m.time > last).sort((a, b) => a.time - b.time);
  if (!last) {
    // Lần đầu: chỉ đánh dấu mốc, không trả lời tin cũ
    await env.DB.put('oa:last', String(Math.max(Date.now() - 60000, ...j.data.map((m) => +m.time || 0))));
    return 1;
  }
  let used = 1, done = last;
  for (const m of fresh) {
    if (used + 4 > budget) break; // hết lượt: phút sau xử lý tiếp từ tin này
    done = +m.time;
    if (m.type !== 'text') continue; // ảnh, sticker: OA admin tự xem trong app
    const fromUser = +m.src === 1;
    used += (await onOaMessage(env, { fromUser, uid: fromUser ? m.from_id : m.to_id, name: fromUser ? m.from_display_name : m.to_display_name, text: m.message })) ? 4 : 0;
  }
  if (done > last) await env.DB.put('oa:last', String(done));
  return used;
}

// 1 tin nhắn trong khung chat OA. fromUser: khách gửi => trả lời như bot.
// OA gửi bắt đầu "/giao" hoặc "/bh" => ghi phiếu bảo hành cho khách đó. Trả về true nếu đã xử lý.
async function onOaMessage(env, { fromUser, uid, name, text }) {
  text = String(text || '').trim();
  if (!uid || !text) return false;
  const id = `oa:${uid}`;
  if (fromUser) {
    // Nút trong menu OA gửi cú pháp không dấu cách, đổi lại thành câu bot hiểu
    text = text.replace(/^#baohanh$/i, 'bảo hành').replace(/^#khuyenmai$/i, 'khuyến mãi');
    await onUpdate(env, { message: { chat: { id }, from: { display_name: name }, text } }).catch((e) => console.error(e));
    return true;
  }
  if (!/^\/(giao|bh)\b/i.test(text)) return false;
  let body = text.replace(/^\/(giao|bh)[\s+:,]*/i, '').replace(/[\s)"”.,;]+$/, '');
  // "/giao Thuý Trần 0909067474 Thay pin 15 pro max 12t": chữ trước SĐT là tên khách, sau SĐT là máy + dịch vụ.
  // Webhook không gửi tên khách nên lấy tên đã lưu nếu thầy không ghi.
  const { metadata: c } = await env.DB.getWithMetadata(`c:${id}`);
  const ph = findPhone(body);
  let patch = null;
  if (ph) {
    const at = body.search(/(?:\+?84|0)(?:[ .-]?\d){9}(?!\d)/);
    const given = body.slice(0, at).replace(/[\s,;:-]+$/, '').trim();
    body = body.slice(at).replace(/^(?:\+?84|0)(?:[ .-]?\d){9}[\s,;:-]*/, '');
    if (given) name = given;
    patch = { ph: ph.replace(/^\+?84/, '0') };
  }
  name = name || (c && c.n) || '';
  const job = parseJob(body);
  if (!job.m) return false;
  if (patch || (name && !(c && c.n))) await saveCustomer(env, id, name, patch || {});
  const r = await registerWarranty(env, id, name, job.m, job.mo);
  const s = await addStamp(env, id, name);
  await send(env, id, warrantyCard(r, s));
  return true;
}

// Zalo đẩy tin OA (webhook) qua trang Vercel kiemtienai-ws2n.vercel.app/api/oa-hook (nhánh main), trang đó chuyển nguyên văn về đây.
// Máy chủ Cloudflare không ở Việt Nam nên Zalo không cho đọc tin bằng listrecentchat (lỗi -501); webhook thì không bị chặn.
// Chữ ký: X-ZEvent-Signature = sha256(app_id + nội dung + timestamp + Khóa bí mật OA), khóa này lấy ở mục Webhook của ứng dụng.
async function onOaHook(request, env, ctx) {
  const raw = await request.text();
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return json({ ok: false }, 400); }
  const cfg = (await env.DB.get('oa', 'json')) || {};
  if (cfg.whkey) {
    const got = (request.headers.get('X-ZEvent-Signature') || '').replace(/^mac=/, '');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ev.app_id || ''}${raw}${ev.timestamp || ''}${cfg.whkey}`)));
    if (got !== Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')) return json({ ok: false, error: 'bad signature' }, 401);
  }
  await env.DB.put('oa:hook', String(Date.now()));
  const name = ev.event_name || '';
  console.log('oa hook', name, (ev.sender && ev.sender.id) || '', (ev.message && ev.message.text || '').slice(0, 40));
  if (!/^(user|oa)_send_text$/.test(name)) return json({ ok: true });
  // Zalo có thể gửi lại cùng 1 tin, chỉ xử lý 1 lần
  const mid = (ev.message && ev.message.msg_id) || '';
  if (mid) {
    if (await env.DB.get(`oa:ev:${mid}`)) return json({ ok: true });
    await env.DB.put(`oa:ev:${mid}`, '1', { expirationTtl: 86400 });
  }
  const fromUser = name === 'user_send_text';
  const uid = fromUser ? ev.sender && ev.sender.id : ev.recipient && ev.recipient.id;
  ctx.waitUntil(onOaMessage(env, { fromUser, uid, name: '', text: ev.message && ev.message.text }).catch((e) => console.error(e)));
  return json({ ok: true });
}

// Link cấp quyền OA (PKCE): code_verifier 43 ký tự, code_challenge = base64url(sha256(verifier))
async function oaConnectUrl(env) {
  const cfg = (await env.DB.get('oa', 'json')) || {};
  if (!cfg.app_id || !cfg.secret) return null;
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const rnd = crypto.getRandomValues(new Uint8Array(43));
  const verifier = Array.from(rnd, (b) => abc[b % abc.length]).join('');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = crypto.randomUUID();
  await env.DB.put('oa:pkce', JSON.stringify({ verifier, state }), { expirationTtl: 900 });
  const q = new URLSearchParams({ app_id: cfg.app_id, redirect_uri: env.OA_CALLBACK || OA_CALLBACK, code_challenge: challenge, state });
  return `${OA_OAUTH}/permission?${q}`;
}

async function onOaCallback(url, env) {
  const page = (msg) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<body style="font:16px system-ui;padding:24px;max-width:520px;margin:auto"><h2>${msg}</h2><p><a href="/admin">Về trang quản lý</a></p>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const pk = await env.DB.get('oa:pkce', 'json');
  if (!pk || pk.state !== url.searchParams.get('state') || !url.searchParams.get('code')) return page('❌ Link cấp quyền đã hết hạn. Vào trang quản lý bấm "Cấp quyền OA" lại.');
  await env.DB.delete('oa:pkce');
  const tok = await oaTokens(env, { code: url.searchParams.get('code'), grant_type: 'authorization_code', code_verifier: pk.verifier });
  if (!tok) return page(`❌ Zalo chưa cấp token: ${((await env.DB.get('oa', 'json')) || {}).err}`);
  const cfg = await env.DB.get('oa', 'json');
  cfg.oa_id = url.searchParams.get('oa_id') || cfg.oa_id;
  await env.DB.put('oa', JSON.stringify(cfg));
  return page('✅ Đã kết nối OA. Từ giờ khách nhắn OA sẽ được bot trả lời trong khoảng 1 phút.');
}

// --- Admin: chủ tiệm (OWNER_CHAT_ID) + người được thêm bằng /admin hoặc trang /admin ---
// KV "admins": [{ id: chatId hoặc null nếu chưa nhắn bot, ph: SĐT, n: tên }]
async function getAdmins(env) {
  return (env.DB && (await env.DB.get('admins', 'json'))) || [];
}

async function adminIds(env) {
  const ids = (await getAdmins(env)).map((a) => a.id);
  return [...new Set([env.OWNER_CHAT_ID, ...ids].filter(Boolean).map(String))];
}

// Thêm admin theo SĐT: khách đã nhắn bot SĐT đó thì có hiệu lực ngay, chưa thì chờ người đó nhắn SĐT
async function addAdmin(env, phone) {
  const list = (await getAdmins(env)).filter((a) => a.ph !== phone);
  const id = await findByPhone(env, phone);
  let n = '';
  if (id) n = ((await env.DB.getWithMetadata(`c:${id}`)).metadata || {}).n || '';
  list.push({ id, ph: phone, n });
  await env.DB.put('admins', JSON.stringify(list));
  return { id, ph: phone, n };
}

async function removeAdmin(env, phone) {
  const list = await getAdmins(env);
  const left = list.filter((a) => a.ph !== phone);
  await env.DB.put('admins', JSON.stringify(left));
  return list.length - left.length;
}

// Người được thêm làm admin nhắn SĐT của mình lần đầu => gắn chat id
async function claimAdmin(env, chatId, name, phone) {
  const list = await getAdmins(env);
  const a = list.find((x) => x.ph === phone && x.id !== chatId);
  if (!a) return false;
  a.id = chatId;
  a.n = name || a.n;
  await env.DB.put('admins', JSON.stringify(list));
  return true;
}

async function notifyOwner(env, text) {
  let first = null;
  for (const id of await adminIds(env)) {
    const r = await send(env, id, text);
    if (!first || (r && r.ok)) first = r;
  }
  return first;
}

async function onUpdate(env, update) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);
  const sender = { name: msg.from && msg.from.display_name, chatId };
  const text = (msg.text || '').trim();

  if (text === '/id') return send(env, chatId, `Chat id của bạn: ${chatId}`);

  if ((await adminIds(env)).includes(chatId)) return onOwner(env, chatId, text);

  // Webhook OA không gửi tên khách: dùng tên đã lưu, để không xóa mất tên khi lưu lại khách
  const known = env.DB ? (await env.DB.getWithMetadata(`c:${chatId}`)).metadata : null;
  if (!sender.name && known) sender.name = known.n;

  const t = norm(text);
  if (STOP_WORDS.test(t)) {
    await saveCustomer(env, chatId, sender.name, { off: true });
    return send(env, chatId, 'Dạ bên em đã ngừng gửi tin khuyến mãi cho anh/chị ạ. Khi nào anh/chị muốn nhận lại, anh/chị nhắn "nhan km" giúp em ạ.');
  }
  if (START_WORDS.test(t)) {
    await saveCustomer(env, chatId, sender.name, { off: false });
    return send(env, chatId, `✅ Dạ, anh/chị sẽ nhận được tin khuyến mãi mới nhất từ ${SHOP.name} ạ. Em cảm ơn anh/chị!`);
  }
  // Khách nhắn kèm SĐT => lưu SĐT cùng tài khoản Zalo, để đối chiếu với danh sách khách KiotViet
  const phoneInText = findPhone(text);
  const ph = phoneInText && phoneInText.replace(/^\+?84/, '0');
  await saveCustomer(env, chatId, sender.name, ph ? { ph } : undefined);
  if (env.DB && ph && (await claimAdmin(env, chatId, sender.name, ph))) {
    await notifyOwner(env, `👤 ${sender.name || ph} (${ph}) đã nhận quyền quản trị bot.`);
    return send(env, chatId, `✅ Dạ anh/chị đã được thêm làm quản trị bot ${SHOP.name}. Nhắn bất kỳ để xem các lệnh ạ.`);
  }
  if (env.DB && ph) await claimBirthday(env, chatId, sender.name, ph);
  // Thầy đã ghi phiếu cho SĐT này => gửi phiếu cho khách luôn
  if (env.DB && ph && (await deliverPending(env, chatId, sender.name, ph))) return;

  if (STOP_REMIND_WORDS.test(t)) {
    if (env.DB) await env.DB.delete(`f:${chatId}`);
    return send(env, chatId, 'Dạ bên em đã tắt tin nhắc sau sửa máy ạ. Phiếu bảo hành của anh/chị vẫn còn hiệu lực đầy đủ ạ.');
  }
  if (env.DB && POINT_WORDS.test(t)) return send(env, chatId, await pointsInfo(env, chatId));
  // Khách tự báo ngày sinh: "sinh nhật em 15/8", "ngày sinh 15/08/1990"
  const sn = env.DB && t.match(/^(sinh nhat|ngay sinh)( (cua )?(em|toi|minh|anh|chi|con))?( la)? (\d{1,2}) (\d{1,2})( |$)/);
  if (sn) {
    const dm = parseDayMonth(`${sn[6]}/${sn[7]}`);
    if (dm) {
      await env.DB.put(`b:${chatId}`, '', { metadata: { d: dm, n: sender.name || '', y: 0, ph: ph || '' } });
      return send(env, chatId, `🎂 Dạ em đã lưu sinh nhật ${dm} của anh/chị. Đến ngày ${SHOP.name} có quà tặng anh/chị ạ!`);
    }
  }
  // Khách tự tra cứu phiếu bảo hành (học Điện Thoại Vui: tra cứu bảo hành online)
  // Khách có phiếu nhắn bất kỳ câu nào có "bảo hành" => xem ngay ngày bảo hành của mình
  if (env.DB && !WARRANTY_WORDS.test(t) && (LOOKUP_WORDS.test(t) || /(^| )bao hanh( |$)/.test(t))) {
    const list = await getCards(env, chatId);
    if (list.length) return send(env, chatId, lookupCards(list, sender.name, ph || (known && known.ph)));
    if (LOOKUP_WORDS.test(t)) {
      return send(env, chatId, `Dạ anh/chị nhắn giúp em số điện thoại ghi trên phiếu bảo hành để em tra phiếu ạ (VD: 0909123456).`);
    }
  }
  // Khách nhắn "nhận máy iPhone 13" lúc lấy máy => phiếu bảo hành điện tử + tự nhắc
  if (env.DB && WARRANTY_WORDS.test(t)) {
    const dev = findDevice(t);
    const rest = text.replace(/^\s*(kích hoạt bảo hành|kich hoat bao hanh|kích hoạt|kich hoat|đã nhận máy|da nhan may|nhận máy|nhan may)\s*/i, '');
    const r = await registerWarranty(env, chatId, sender.name, dev && dev !== 'iPad' ? dev : rest);
    const s = await addStamp(env, chatId, sender.name);
    await send(env, chatId, warrantyCard(r, s));
    if (s.voucher) await send(env, chatId, voucherMessage(s.voucher));
    const pts = s.voucher ? `đủ ${STAMPS_NEEDED}, đã tặng voucher ${s.voucher}` : `${s.p}/${STAMPS_NEEDED}`;
    await notifyOwner(env,
      `🛡️ Khách ${r.n || ''} vừa kích hoạt bảo hành điện tử, máy: ${r.m || '(chưa ghi)'}.\n` +
      `⭐ Điểm: ${pts}${s.skipped ? ' (không cộng: đã cộng điểm trong 7 ngày qua)' : ''}\nMã khách: ${chatId}`);
    return;
  }

  if (!update.event_name || update.event_name === 'message.text.received') {
    if (!text) return;
    const promo = env.DB ? await env.DB.get('promo') : null;
    // Khách vừa hỏi đổi/bán máy rồi gửi tình trạng máy ("256gb pin 85%"): đó là thông tin để thầy báo giá dự kiến, không phải hỏi giá sửa
    if (env.DB && TRADE_INFO.test(t) && !/(^| )(bao nhieu|gia)( |$)/.test(t) && (await env.DB.get(`tr:${chatId}`))) {
      await send(env, chatId, 'Dạ em cảm ơn anh/chị, em đã nhận thông tin máy ạ. Bên em sẽ báo giá dự kiến cho anh/chị sớm nhất ạ.');
      await notifyOwner(env, `🔄 Khách ${sender.name || ''} gửi thông tin máy cũ: "${text}"\nThầy báo giá dự kiến giúp khách.\nTrả lời: /tl ${chatId} <nội dung>`);
      return;
    }
    const { reply, notify } = handleText(text, sender, promo);
    if (env.DB && notify && notify.startsWith('🔄')) await env.DB.put(`tr:${chatId}`, '1', { expirationTtl: 7200 });
    // Tin đầu tiên của khách: cảm ơn trước khi trả lời (học FPT Shop). Câu chào chung đã có lời chào sẵn.
    const thanks = env.DB && !known && !reply.includes('xin chào') ? `Dạ ${SHOP.name} cảm ơn anh/chị${sender.name ? ' ' + sender.name : ''} đã liên hệ ạ!\n\n` : '';
    await send(env, chatId, thanks + reply);
    if (notify) await notifyOwner(env, notify);
    return;
  }

  // Ảnh, sticker, ghi âm...
  await send(env, chatId, `Dạ ${SHOP.name} đã nhận được tin của anh/chị ạ. Anh/chị chờ em một chút, kỹ thuật sẽ xem và phản hồi ngay ạ.${CTA}`);
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

// --- Trang quản lý /admin: mật khẩu là ADMIN_KEY (nếu có) hoặc WEBHOOK_SECRET ---
async function onAdminApi(request, env) {
  const key = env.ADMIN_KEY || env.WEBHOOK_SECRET;
  if (!key || request.headers.get('X-Key') !== key) {
    await new Promise((r) => setTimeout(r, 1000)); // chậm lại để khó dò mật khẩu
    return json({ ok: false, error: 'Sai mật khẩu' }, 403);
  }
  if (!env.DB) return json({ ok: false, error: 'Chưa gắn KV DB' }, 500);
  const d = await request.json().catch(() => ({}));
  const phoneOf = (s) => (findPhone(s) || '').replace(/^\+?84/, '0');

  switch (d.action) {
    case 'state': {
      const [presets, promo, bc, customers, bday, admins] = await Promise.all([
        getPresets(env), env.DB.get('promo'), env.DB.get('bc', 'json'), countCustomers(env), getBday(env), getAdmins(env),
      ]);
      const births = [];
      for (const prefix of ['b:', 'bp:']) {
        let cursor;
        do {
          const page = await env.DB.list({ prefix, cursor });
          for (const k of page.keys) {
            births.push(prefix === 'b:'
              ? { key: k.name, d: (k.metadata || {}).d, n: (k.metadata || {}).n, ph: (k.metadata || {}).ph, wait: false }
              : { key: k.name, ph: k.name.slice(3), wait: true });
          }
          cursor = page.list_complete ? null : page.cursor;
        } while (cursor);
      }
      for (const b of births.filter((x) => x.wait)) b.d = await env.DB.get(b.key);
      const o = (await env.DB.get('oa', 'json')) || {};
      const oa = { app_id: o.app_id || '', hasSecret: !!o.secret, secretLen: (o.secret || '').length, connected: !!o.refresh_token, exp: o.exp || 0, err: o.err || '', oa_id: o.oa_id || '',
        hasWhkey: !!o.whkey, hook: +(await env.DB.get('oa:hook')) || 0 };
      return json({ ok: true, presets, promo, bc, customers, bday, admins, births, oa, defaultPresets: PROMO_PRESETS, defaultBday: BDAY_TEXT });
    }
    case 'oaSave': {
      const o = (await env.DB.get('oa', 'json')) || {};
      const appId = String(d.app_id || '').trim();
      const secret = String(d.secret || '').trim();
      // Khóa bí mật Zalo dài 20 ký tự; ngắn hơn thường là trình duyệt tự điền mật khẩu trang quản lý
      if (secret && (secret.length < 16 || secret === (env.ADMIN_KEY || env.WEBHOOK_SECRET))) {
        return json({ ok: false, error: 'Khóa bí mật chưa đúng (phải khoảng 20 ký tự). Bấm nút sao chép cạnh ô Khóa bí mật trên trang Zalo rồi dán lại.' }, 400);
      }
      const whkey = String(d.whkey || '').trim();
      if (appId) o.app_id = appId;
      if (secret) o.secret = secret;
      if (whkey) o.whkey = whkey;
      await env.DB.put('oa', JSON.stringify(o));
      return json({ ok: true });
    }
    case 'oaConnect': {
      const u = await oaConnectUrl(env);
      return u ? json({ ok: true, url: u }) : json({ ok: false, error: 'Điền App ID và Secret key trước' }, 400);
    }
    case 'oaRefresh': {
      // Dán refresh token lấy từ công cụ API Explorer của Zalo
      const rt = String(d.refresh_token || '').trim();
      if (!rt) return json({ ok: false, error: 'Chưa dán refresh token' }, 400);
      const tok = await oaTokens(env, { refresh_token: rt, grant_type: 'refresh_token' });
      return tok ? json({ ok: true }) : json({ ok: false, error: `Zalo báo lỗi: ${((await env.DB.get('oa', 'json')) || {}).err}` }, 400);
    }
    case 'oaTest': {
      // Thử đọc 3 tin gần nhất của OA (không gửi gì), để biết token và quyền đã dùng được chưa
      const token = await oaToken(env);
      if (!token) return json({ ok: false, error: 'OA chưa kết nối' }, 400);
      if (d.send) return json(await sendOa(env, String(d.send), 'test')); // thử gửi tới 1 user_id (có thể không tồn tại)
      const r = await fetch(`${OA_API}/v2.0/oa/listrecentchat?data=${encodeURIComponent(JSON.stringify({ offset: 0, count: 3 }))}`, { headers: await oaHeaders(env, token) });
      const j = await r.json().catch(() => ({ error: r.status }));
      return json({ ok: j.error === 0, error: j.error, message: j.message, count: Array.isArray(j.data) ? j.data.length : 0,
        last: (await env.DB.get('oa:last')) || '' });
    }
    case 'oaOff': {
      const o = (await env.DB.get('oa', 'json')) || {};
      delete o.access_token;
      delete o.refresh_token;
      await env.DB.put('oa', JSON.stringify(o));
      return json({ ok: true });
    }
    case 'savePresets': {
      const list = (d.presets || [])
        .map((p) => [String(p[0] || '').trim().slice(0, 60), String(p[1] || '').trim().slice(0, 1000)])
        .filter((p) => p[0] && p[1])
        .slice(0, 30);
      if (!list.length) return json({ ok: false, error: 'Chưa có mẫu nào' }, 400);
      await env.DB.put('presets', JSON.stringify(list));
      return json({ ok: true });
    }
    case 'resetPresets':
      await env.DB.delete('presets');
      return json({ ok: true });
    case 'sendPromo': {
      const text = String(d.text || '').trim();
      if (!text) return json({ ok: false, error: 'Chưa có nội dung' }, 400);
      const count = await startBroadcast(env, text);
      await notifyOwner(env, `📣 Trang quản lý vừa gửi khuyến mãi cho ${count} khách:\n\n${text.slice(0, 500)}`);
      return json({ ok: true, count });
    }
    case 'stopPromo':
      await env.DB.delete('promo');
      await env.DB.delete('bc');
      return json({ ok: true });
    case 'testPromo': {
      const text = String(d.text || '').trim();
      for (const id of await adminIds(env)) await send(env, id, `(Tin thử) ${promoMessage(text)}`);
      return json({ ok: true });
    }
    case 'saveBday':
      await env.DB.put('bday', JSON.stringify({ on: !!d.on, text: String(d.text || BDAY_TEXT).slice(0, 1500) }));
      return json({ ok: true });
    case 'testBday': {
      const cfg = await getBday(env);
      for (const id of await adminIds(env)) await send(env, id, `(Tin thử) ${bdayMessage({ ...cfg, text: d.text || cfg.text }, 'Khang')}`);
      return json({ ok: true });
    }
    case 'addBirthdays': {
      // Mỗi dòng: SĐT và ngày/tháng, VD "0909123456 15/8"
      let saved = 0, waiting = 0;
      const bad = [];
      for (const line of String(d.lines || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 300)) {
        const ph = phoneOf(line);
        const dm = parseDayMonth(ph ? line.replace(/(?:\+?84|0)(?:[ .-]?\d){9}(?!\d)/, ' ') : '');
        if (!ph || !dm) { bad.push(line); continue; }
        if (await saveBirthday(env, ph, dm)) saved++;
        else waiting++;
      }
      return json({ ok: true, saved, waiting, bad });
    }
    case 'delBirthday':
      if (/^bp?:/.test(d.key || '')) await env.DB.delete(d.key);
      return json({ ok: true });
    case 'addAdmin': {
      const ph = phoneOf(d.phone);
      if (!ph) return json({ ok: false, error: 'SĐT chưa đúng' }, 400);
      return json({ ok: true, admin: await addAdmin(env, ph) });
    }
    case 'delAdmin':
      await removeAdmin(env, phoneOf(d.phone));
      return json({ ok: true });
  }
  return json({ ok: false, error: 'Không rõ thao tác' }, 400);
}

const ADMIN_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Quản lý bot ${SHOP.name}</title>
<style>
:root{--bg:#f4f6fb;--card:#fff;--ink:#1d2433;--mute:#667085;--line:#e3e7ef;--pri:#0068ff;--ok:#12a150;--bad:#d92d20}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:var(--pri);color:#fff;padding:14px 16px;font-weight:700;font-size:18px}
main{max-width:860px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
h2{font-size:17px;margin:0 0 4px}.mute{color:var(--mute);font-size:13px}
textarea,input{width:100%;font:inherit;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
textarea{min-height:90px;resize:vertical}
button{font:inherit;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;background:#eef2f8;color:var(--ink)}
button.pri{background:var(--pri);color:#fff}button.bad{background:#fde8e7;color:var(--bad)}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.row>*{flex:0 0 auto}
.preset{border:1px solid var(--line);border-radius:10px;padding:10px;margin:10px 0}
.preset input{font-weight:600;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:7px 6px;border-bottom:1px solid var(--line);text-align:left}
.tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;background:#eef2f8}
#msg{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#1d2433;color:#fff;padding:10px 16px;border-radius:10px;display:none;max-width:90vw}
#login{max-width:360px;margin:40px auto}
</style></head><body>
<header>Quản lý bot ${SHOP.name}</header>
<main>
<div id="login" class="card"><h2>Đăng nhập</h2><p class="mute">Nhập mật khẩu quản lý bot.</p>
<input id="key" type="password" placeholder="Mật khẩu"><div class="row"><button class="pri" onclick="login()">Vào trang quản lý</button></div></div>
<div id="app" style="display:none">

<div class="card"><h2>📣 Gửi khuyến mãi</h2>
<p class="mute">Gửi cho <b id="cnt">…</b> khách đã nhắn bot (trừ khách đã nhắn "huy km"). Bot gửi 8h–21h, mỗi phút 25 khách. Bot cũng tự kèm khuyến mãi này khi trả lời giá.</p>
<div id="running" class="mute"></div>
<textarea id="promo" placeholder="Nội dung khuyến mãi, hoặc bấm 'Dùng mẫu này' ở dưới"></textarea>
<div class="row"><button onclick="testPromo()">Gửi thử cho admin</button><button class="pri" onclick="sendPromo()">Gửi cho tất cả khách</button><button class="bad" onclick="stopPromo()">Tắt khuyến mãi</button></div></div>

<div class="card"><h2>📋 Mẫu khuyến mãi</h2><p class="mute">Sửa tên và nội dung rồi bấm Lưu mẫu. Dòng đầu nội dung là tiêu đề. Trong chat bot, gõ /km &lt;số&gt; để gửi mẫu đó.</p>
<div id="presets"></div>
<div class="row"><button onclick="addPreset()">+ Thêm mẫu</button><button class="pri" onclick="savePresets()">Lưu mẫu</button><button onclick="resetPresets()">Khôi phục mẫu gốc</button></div></div>

<div class="card"><h2>🎂 Chúc mừng sinh nhật</h2>
<p class="mute">Đúng ngày sinh nhật, khoảng 9h sáng, bot tự gửi lời chúc (mỗi năm 1 lần). Chữ {ten} sẽ được thay bằng tên Zalo của khách. Khách cũng có thể tự nhắn bot "sinh nhật 15/8".</p>
<label><input id="bon" type="checkbox" style="width:auto"> Bật tự chúc sinh nhật</label>
<textarea id="btext" style="margin-top:8px;min-height:150px"></textarea>
<div class="row"><button onclick="testBday()">Gửi thử cho admin</button><button class="pri" onclick="saveBday()">Lưu lời chúc</button><button onclick="resetBday()">Lời chúc gốc</button></div>
<h2 style="margin-top:16px">Thêm ngày sinh khách</h2><p class="mute">Mỗi dòng 1 khách: SĐT và ngày/tháng. VD: 0909123456 15/8</p>
<textarea id="blines" placeholder="0909123456 15/8&#10;0981308308 2/9"></textarea>
<div class="row"><button class="pri" onclick="addBirthdays()">Lưu ngày sinh</button></div>
<table id="births"></table></div>

<div class="card"><h2>🏢 Kết nối Zalo OA</h2>
<p class="mute">Kết nối xong, khách nhắn OA Khanghuyapple cũng được bot tự trả lời (giá sửa, giá máy, bảo hành) trong khoảng 1 phút. Trong khung chat OA với khách, gõ <b>/bh iPhone 13 thay pin 12t</b> là khách nhận phiếu bảo hành điện tử.</p>
<div id="oast" style="margin:8px 0"></div>
<input id="oaapp" placeholder="App ID (developers.zalo.me)" style="margin-bottom:6px"><input id="oasec" type="text" autocomplete="off" spellcheck="false" placeholder="Dán Khóa bí mật của ứng dụng (20 ký tự)" oninput="$('oalen').textContent = this.value.trim().length + ' ký tự'"><div id="oalen" class="mute"></div>
<div class="row"><button onclick="oaSave()">Lưu App ID, Secret</button><button class="pri" onclick="oaConnect()">Cấp quyền OA</button><button class="bad" onclick="oaOff()">Ngắt kết nối</button></div>
<p class="mute" style="margin-top:10px">Webhook (developers.zalo.me &gt; Webhook): URL <b>https://kiemtienai-ws2n.vercel.app/api/oa-hook</b>. Dán <b>Khóa bí mật OA</b> ở trang Webhook vào đây để bot chỉ nhận tin thật từ Zalo.</p>
<div class="row" style="flex-wrap:nowrap"><input id="whkey" type="text" autocomplete="off" spellcheck="false" placeholder="Khóa bí mật OA (mục Webhook)" style="flex:1"><button onclick="whSave()">Lưu khóa Webhook</button></div>
<details style="margin-top:10px"><summary class="mute">Cách khác: dán refresh token từ API Explorer</summary>
<input id="oart" placeholder="Refresh token" style="margin-top:6px"><div class="row"><button onclick="oaRefresh()">Kết nối bằng refresh token</button></div></details></div>

<div class="card"><h2>👤 Người quản trị bot</h2><p class="mute">Admin nhận tin báo đơn và dùng được lệnh chủ tiệm trong chat bot. Người được thêm cần nhắn bot SĐT của mình 1 lần để nhận quyền.</p>
<table id="admins"></table>
<div class="row" style="flex-wrap:nowrap"><input id="adph" placeholder="SĐT, VD 0909067474" style="flex:1"><button class="pri" onclick="addAdmin()">Thêm admin</button></div></div>

</div></main><div id="msg"></div>
<script>
var KEY = '', S = null;
try { KEY = sessionStorage.getItem('k') || ''; } catch (e) {}
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function toast(t) { var m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { m.style.display = 'none'; }, 3500); }
function api(action, data) {
  var body = Object.assign({ action: action }, data || {});
  return fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Key': KEY }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (j) { if (!j.ok) throw new Error(j.error || 'Lỗi'); return j; });
}
function login() { KEY = $('key').value.trim(); load(); }
function load() {
  if (!KEY) return;
  api('state').then(function (s) {
    S = s; try { sessionStorage.setItem('k', KEY); } catch (e) {}
    $('login').style.display = 'none'; $('app').style.display = 'block'; render();
  }).catch(function (e) { toast(e.message); try { sessionStorage.removeItem('k'); } catch (x) {} });
}
function render() {
  $('cnt').textContent = S.customers.total - S.customers.off;
  $('running').innerHTML = S.bc ? '⏳ Đang gửi: ' + S.bc.sent + ' khách đã nhận' + (S.bc.failed ? ', ' + S.bc.failed + ' lỗi' : '') : (S.promo ? '✅ Khuyến mãi đang chạy: ' + esc(S.promo.split('\\n')[0]) : '');
  renderPresets(S.presets);
  $('bon').checked = !!S.bday.on; $('btext').value = S.bday.text;
  var b = S.births.slice().sort(function (x, y) { return (x.d || '').split('/').reverse().join('') < (y.d || '').split('/').reverse().join('') ? -1 : 1; });
  $('births').innerHTML = b.length ? '<tr><th>Ngày</th><th>Khách</th><th></th></tr>' + b.map(function (x) {
    return '<tr><td>' + esc(x.d) + '</td><td>' + esc(x.n || '') + ' ' + esc(x.ph || '') + (x.wait ? ' <span class="tag">chờ khách nhắn bot</span>' : '') +
      '</td><td><button class="bad" onclick="delBirthday(\\'' + esc(x.key) + '\\')">Xóa</button></td></tr>';
  }).join('') : '<tr><td class="mute">Chưa có ngày sinh nào.</td></tr>';
  var o = S.oa; $('oaapp').value = o.app_id;
  $('oast').innerHTML = o.connected ? '<span class="tag" style="background:#e3f6ea">✅ Đã kết nối OA' + (o.oa_id ? ' ' + esc(o.oa_id) : '') + '</span>' + (S.customers.oa ? ' <span class="mute">' + S.customers.oa + ' khách đã nhắn OA</span>' : '')
    : '<span class="tag">Chưa kết nối</span> <span class="mute">' + (o.app_id ? 'App ID đã lưu' : 'Chưa có App ID') + (o.hasSecret ? ', Secret đã lưu (' + o.secretLen + ' ký tự' + (o.secretLen === 20 ? '' : ', CHƯA ĐÚNG') + ')' : ', chưa có Secret') + '</span>';
  if (o.connected) $('oast').innerHTML += '<div class="mute">Nhận tin qua Webhook: ' + (o.hook ? 'lần cuối ' + new Date(o.hook).toLocaleString('vi-VN') : 'chưa nhận tin nào') +
    (o.hasWhkey ? ', đã có khóa kiểm tra' : ', chưa lưu Khóa bí mật OA') + '</div>';
  if (o.err) $('oast').innerHTML +='<div class="mute" style="color:var(--bad)">Lỗi gần nhất: ' + esc(o.err) + '</div>';
  $('admins').innerHTML ='<tr><td>Chủ tiệm</td><td><span class="tag">chính</span></td><td></td></tr>' + S.admins.map(function (a) {
    return '<tr><td>' + esc(a.n || '') + ' ' + esc(a.ph) + '</td><td>' + (a.id ? '<span class="tag">đã nhận quyền</span>' : '<span class="tag">chờ nhắn SĐT cho bot</span>') +
      '</td><td><button class="bad" onclick="delAdmin(\\'' + esc(a.ph) + '\\')">Bỏ</button></td></tr>';
  }).join('');
}
function renderPresets(list) {
  $('presets').innerHTML = list.map(function (p, i) {
    return '<div class="preset"><input value="' + esc(p[0]) + '" data-i="' + i + '" class="pn"><textarea class="pb">' + esc(p[1]) + '</textarea>' +
      '<div class="row"><button onclick="usePreset(' + i + ')">Dùng mẫu này</button><button class="bad" onclick="delPreset(' + i + ')">Xóa mẫu</button><span class="mute">Lệnh chat: /km ' + (i + 1) + '</span></div></div>';
  }).join('');
}
function readPresets() {
  var n = document.querySelectorAll('.pn'), b = document.querySelectorAll('.pb'), out = [];
  for (var i = 0; i < n.length; i++) out.push([n[i].value, b[i].value]);
  return out;
}
function usePreset(i) { $('promo').value = readPresets()[i][1]; $('promo').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function addPreset() { var l = readPresets(); l.push(['Mẫu mới', '🔥 TIÊU ĐỀ\\nNội dung khuyến mãi']); renderPresets(l); }
function delPreset(i) { var l = readPresets(); l.splice(i, 1); renderPresets(l); }
function savePresets() { api('savePresets', { presets: readPresets() }).then(function () { toast('Đã lưu mẫu'); load(); }).catch(function (e) { toast(e.message); }); }
function resetPresets() { if (confirm('Khôi phục 9 mẫu gốc? Mẫu đã sửa sẽ mất.')) api('resetPresets').then(function () { toast('Đã khôi phục'); load(); }); }
function testPromo() { if (!$('promo').value.trim()) return toast('Chưa có nội dung'); api('testPromo', { text: $('promo').value }).then(function () { toast('Đã gửi thử cho admin'); }).catch(function (e) { toast(e.message); }); }
function sendPromo() {
  var t = $('promo').value.trim(); if (!t) return toast('Chưa có nội dung');
  if (!confirm('Gửi khuyến mãi này cho ' + $('cnt').textContent + ' khách?')) return;
  api('sendPromo', { text: t }).then(function (j) { toast('Đang gửi cho ' + j.count + ' khách'); load(); }).catch(function (e) { toast(e.message); });
}
function stopPromo() { if (confirm('Tắt khuyến mãi và dừng gửi?')) api('stopPromo').then(function () { toast('Đã tắt'); load(); }); }
function saveBday() { api('saveBday', { on: $('bon').checked, text: $('btext').value }).then(function () { toast('Đã lưu lời chúc'); load(); }).catch(function (e) { toast(e.message); }); }
function resetBday() { $('btext').value = S.defaultBday; }
function testBday() { api('testBday', { text: $('btext').value }).then(function () { toast('Đã gửi thử cho admin'); }).catch(function (e) { toast(e.message); }); }
function addBirthdays() {
  api('addBirthdays', { lines: $('blines').value }).then(function (j) {
    toast('Đã lưu ' + (j.saved + j.waiting) + ' khách' + (j.bad.length ? ', ' + j.bad.length + ' dòng chưa đúng' : ''));
    $('blines').value = j.bad.join('\\n'); load();
  }).catch(function (e) { toast(e.message); });
}
function delBirthday(k) { api('delBirthday', { key: k }).then(load); }
function addAdmin() { api('addAdmin', { phone: $('adph').value }).then(function (j) { toast(j.admin.id ? 'Đã thêm admin' : 'Đã lưu, chờ người đó nhắn SĐT cho bot'); $('adph').value = ''; load(); }).catch(function (e) { toast(e.message); }); }
function oaSave() {
  var sec = $('oasec').value.trim();
  if (sec && sec.length < 16) return toast('Khóa bí mật phải khoảng 20 ký tự, thầy chép lại bằng nút sao chép trên trang Zalo');
  api('oaSave', { app_id: $('oaapp').value, secret: sec }).then(function () { $('oasec').value = ''; $('oalen').textContent = ''; toast(sec ? 'Đã lưu Secret' : 'Đã lưu App ID'); load(); }).catch(function (e) { toast(e.message); });
}
function whSave() {
  var k = $('whkey').value.trim();
  if (!k) return toast('Chưa dán Khóa bí mật OA');
  api('oaSave', { whkey: k }).then(function () { $('whkey').value = ''; toast('Đã lưu khóa Webhook'); load(); }).catch(function (e) { toast(e.message); });
}
function oaConnect() { api('oaConnect').then(function (j) { location.href = j.url; }).catch(function (e) { toast(e.message); }); }
function oaRefresh() { api('oaRefresh', { refresh_token: $('oart').value }).then(function () { $('oart').value = ''; toast('Đã kết nối OA'); load(); }).catch(function (e) { toast(e.message); }); }
function oaOff() { if (confirm('Ngắt kết nối OA? Bot sẽ thôi trả lời khách nhắn OA.')) api('oaOff').then(load); }
function delAdmin(p) { if (confirm('Bỏ quyền admin của ' + p + '?')) api('delAdmin', { phone: p }).then(load); }
$('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
load();
</script></body></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Zalo gửi 1 yêu cầu kiểm tra không kèm secret khi setWebhook: trả 200 để qua kiểm tra, nhưng không xử lý
      if (request.headers.get('X-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        console.log('webhook without valid secret', request.headers.get('User-Agent'));
        return json({ ok: true });
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

    if (url.pathname === '/admin') {
      return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
    }
    if (url.pathname === '/admin/api' && request.method === 'POST') return onAdminApi(request, env);
    if (url.pathname === '/oa/callback' && env.DB) return onOaCallback(url, env);
    if (url.pathname === '/oa/hook' && request.method === 'POST' && env.DB) return onOaHook(request, env, ctx);
    // Tệp xác thực tên miền của ứng dụng Zalo "Khang Huy Apple Trợ Lý" (developers.zalo.me > Xác thực domain)
    if (url.pathname === `/zalo_verifier${ZALO_SITE_VERIFY}.html`) {
      return new Response(
        `<!DOCTYPE html>\n<html lang="en">\n\n<head>\n    <meta property="zalo-platform-site-verification" content="${ZALO_SITE_VERIFY}" />\n</head>\n\n<body>\nThere Is No Limit To What You Can Accomplish Using Zalo!\n</body>\n\n</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Mở 1 lần sau khi deploy: https://<worker>/setup?key=<WEBHOOK_SECRET>
    // Mặc định xóa webhook để bot tự lấy tin (getUpdates). Thêm &mode=webhook khi đã có tên miền riêng không bị chặn.
    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) {
        return new Response('Sai key', { status: 403 });
      }
      if (url.searchParams.get('mode') === 'webhook') {
        return json(await callApi(env, 'setWebhook', { url: `${url.origin}/webhook`, secret_token: env.WEBHOOK_SECRET }));
      }
      return json(await callApi(env, 'deleteWebhook', {}));
    }

    return new Response(`${SHOP.name} Zalo bot đang chạy ✅`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        // Tối đa ~47 lệnh gọi ra ngoài mỗi lần chạy (gói miễn phí cho 50)
        let left = 46 - (await pollOa(env, 12));
        left -= await pollUpdates(env, Math.min(POLL_BUDGET, left));
        left -= await runFollowups(env, Math.min(25, left));
        left -= await runBirthdays(env, Math.min(10, left));
        await runBroadcast(env, Math.min(BATCH, left));
      })().catch((e) => console.error(e))
    );
  },
};
