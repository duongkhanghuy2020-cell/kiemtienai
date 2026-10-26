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

// Giá tiền công (nghìn đồng), trích từ bang-gia-professional.html
const PRICES = {"IPHONE X":{"Ép kính / Ép cảm ứng":"400","Màn hình":"400/600","Phản quang":"250/300","Kính lưng":"250/300","Thay vỏ/Sưởn":"350/400","Độ vỏ/Sưởn":"100/150","Thay pin":"350","Kính Camera sau":"250","Camera trước":"350","Camera sau":"350","Dây chân sạc":"200","Dây cảm biến":"200","Dây nguồn / Dây volume":"300","Thay rung":"200","Loa trong":"200","Loa ngoài":"200","Anten wifi":"300","IC nguồn":"300","Audio Main":"300","Hiển thị / Cảm ứng":"300","Cảm biến":"300","Camera Main":"400","IC sống / Mặt imei":"400","USB sạc":"300","IC wifi":"600","IC đèn":"600","Face ID":"Call","Mở icloud":"Call"},"IPHONE XS MAX":{"Ép kính / Ép cảm ứng":"400/600","Màn hình":"400/600","Phản quang":"300/350","Kính lưng":"300/350","Thay vỏ/Sưởn":"400/500","Độ vỏ/Sưởn":"150/200","Thay pin":"350","Kính Camera sau":"250","Camera trước":"350","Camera sau":"350","Dây chân sạc":"200","Dây cảm biến":"200","Dây nguồn / Dây volume":"300","Thay rung":"200","Loa trong":"200","Loa ngoài":"200","Anten wifi":"300","IC nguồn":"300","Audio Main":"300","Hiển thị / Cảm ứng":"300","Cảm biến":"300","Camera Main":"400","IC sống / Mặt imei":"400","USB sạc":"300","IC wifi":"600","IC đèn":"600","Face ID":"Call","Mở icloud":"Call"},"IPHONE 11":{"Ép kính / Ép cảm ứng":"450","Màn hình":"450","Phản quang":"300/350","Kính lưng":"300/350","Thay vỏ/Sưởn":"400/500","Độ vỏ/Sưởn":"150/200","Thay pin":"350","Kính Camera sau":"300","Camera trước":"400","Camera sau":"400","Dây chân sạc":"200","Dây cảm biến":"200","Dây nguồn / Dây volume":"300","Thay rung":"200","Loa trong":"200","Loa ngoài":"200","Anten wifi":"400","IC nguồn":"400","Audio Main":"400","Hiển thị / Cảm ứng":"400","Cảm biến":"400","Camera Main":"500","IC sống / Mặt imei":"500","USB sạc":"400","IC wifi":"700","IC đèn":"700","Face ID":"Call","Mở icloud":"Call"},"IPHONE 11 PRO":{"Ép kính / Ép cảm ứng":"500","Màn hình":"500","Phản quang":"350/400","Kính lưng":"350/400","Thay vỏ/Sưởn":"450/550","Độ vỏ/Sưởn":"200/250","Thay pin":"400","Kính Camera sau":"350","Camera trước":"450","Camera sau":"450","Dây chân sạc":"250","Dây cảm biến":"250","Dây nguồn / Dây volume":"400","Thay rung":"250","Loa trong":"250","Loa ngoài":"250","Anten wifi":"500","IC nguồn":"500","Audio Main":"500","Hiển thị / Cảm ứng":"500","Cảm biến":"500","Camera Main":"600","IC sống / Mặt imei":"600","USB sạc":"500","IC wifi":"800","IC đèn":"800","Face ID":"Call","Mở icloud":"Call"},"IPHONE 11 PRO MAX":{"Ép kính / Ép cảm ứng":"550","Màn hình":"550","Phản quang":"350/400","Kính lưng":"400/450","Thay vỏ/Sưởn":"500/600","Độ vỏ/Sưởn":"200/250","Thay pin":"400","Kính Camera sau":"350","Camera trước":"500","Camera sau":"500","Dây chân sạc":"300","Dây cảm biến":"300","Dây nguồn / Dây volume":"400","Thay rung":"300","Loa trong":"300","Loa ngoài":"300","Anten wifi":"600","IC nguồn":"600","Audio Main":"600","Hiển thị / Cảm ứng":"600","Cảm biến":"600","Camera Main":"700","IC sống / Mặt imei":"700","USB sạc":"600","IC wifi":"900","IC đèn":"900","Face ID":"Call","Mở icloud":"Call"},"IPHONE 12":{"Ép kính / Ép cảm ứng":"500","Màn hình":"500","Phản quang":"350/400","Kính lưng":"400/450","Thay vỏ/Sưởn":"450/550","Độ vỏ/Sưởn":"200/250","Thay pin":"400","Kính Camera sau":"350","Camera trước":"450","Camera sau":"450","Dây chân sạc":"250","Dây cảm biến":"250","Dây nguồn / Dây volume":"400","Thay rung":"250","Loa trong":"250","Loa ngoài":"250","Anten wifi":"500","IC nguồn":"500","Audio Main":"500","Hiển thị / Cảm ứng":"500","Cảm biến":"500","Camera Main":"600","IC sống / Mặt imei":"600","USB sạc":"500","IC wifi":"800","IC đèn":"800","Face ID":"Call","Mở icloud":"Call"},"IPHONE 12 PRO":{"Ép kính / Ép cảm ứng":"550","Màn hình":"550","Phản quang":"400/450","Kính lưng":"450/500","Thay vỏ/Sưởn":"500/600","Độ vỏ/Sưởn":"250/300","Thay pin":"450","Kính Camera sau":"400","Camera trước":"500","Camera sau":"500","Dây chân sạc":"300","Dây cảm biến":"300","Dây nguồn / Dây volume":"450","Thay rung":"300","Loa trong":"300","Loa ngoài":"300","Anten wifi":"600","IC nguồn":"600","Audio Main":"600","Hiển thị / Cảm ứng":"600","Cảm biến":"600","Camera Main":"700","IC sống / Mặt imei":"700","USB sạc":"600","IC wifi":"900","IC đèn":"900","Face ID":"Call","Mở icloud":"Call"},"IPHONE 12 PRO MAX":{"Ép kính / Ép cảm ứng":"600","Màn hình":"600","Phản quang":"400/450","Kính lưng":"450/500","Thay vỏ/Sưởn":"500/600","Độ vỏ/Sưởn":"250/300","Thay pin":"450","Kính Camera sau":"400","Camera trước":"550","Camera sau":"550","Dây chân sạc":"350","Dây cảm biến":"350","Dây nguồn / Dây volume":"500","Thay rung":"350","Loa trong":"350","Loa ngoài":"350","Anten wifi":"700","IC nguồn":"700","Audio Main":"700","Hiển thị / Cảm ứng":"700","Cảm biến":"700","Camera Main":"800","IC sống / Mặt imei":"800","USB sạc":"700","IC wifi":"1000","IC đèn":"1000","Face ID":"Call","Mở icloud":"Call"},"IPHONE 13":{"Ép kính / Ép cảm ứng":"550","Màn hình":"550","Phản quang":"400/450","Kính lưng":"450/500","Thay vỏ/Sưởn":"500/600","Độ vỏ/Sưởn":"250/300","Thay pin":"450","Kính Camera sau":"400","Camera trước":"500","Camera sau":"500","Dây chân sạc":"300","Dây cảm biến":"300","Dây nguồn / Dây volume":"450","Thay rung":"300","Loa trong":"300","Loa ngoài":"300","Anten wifi":"600","IC nguồn":"600","Audio Main":"600","Hiển thị / Cảm ứng":"600","Cảm biến":"600","Camera Main":"700","IC sống / Mặt imei":"700","USB sạc":"600","IC wifi":"900","IC đèn":"900","Face ID":"Call","Mở icloud":"Call"},"IPHONE 13 PRO":{"Ép kính / Ép cảm ứng":"600","Màn hình":"600","Phản quang":"450/500","Kính lưng":"500/550","Thay vỏ/Sưởn":"550/650","Độ vỏ/Sưởn":"300/350","Thay pin":"500","Kính Camera sau":"450","Camera trước":"550","Camera sau":"550","Dây chân sạc":"350","Dây cảm biến":"350","Dây nguồn / Dây volume":"500","Thay rung":"350","Loa trong":"350","Loa ngoài":"350","Anten wifi":"700","IC nguồn":"700","Audio Main":"700","Hiển thị / Cảm ứng":"700","Cảm biến":"700","Camera Main":"800","IC sống / Mặt imei":"800","USB sạc":"700","IC wifi":"1000","IC đèn":"1000","Face ID":"Call","Mở icloud":"Call"},"IPHONE 13 PRO MAX":{"Ép kính / Ép cảm ứng":"650","Màn hình":"650","Phản quang":"500/550","Kính lưng":"550/600","Thay vỏ/Sưởn":"600/700","Độ vỏ/Sưởn":"350/400","Thay pin":"500","Kính Camera sau":"500","Camera trước":"600","Camera sau":"600","Dây chân sạc":"400","Dây cảm biến":"400","Dây nguồn / Dây volume":"550","Thay rung":"400","Loa trong":"400","Loa ngoài":"400","Anten wifi":"800","IC nguồn":"800","Audio Main":"800","Hiển thị / Cảm ứng":"800","Cảm biến":"800","Camera Main":"900","IC sống / Mặt imei":"900","USB sạc":"800","IC wifi":"1100","IC đèn":"1100","Face ID":"Call","Mở icloud":"Call"},"IPHONE 14":{"Ép kính / Ép cảm ứng":"600","Màn hình":"600","Phản quang":"450/500","Kính lưng":"500/550","Thay vỏ/Sưởn":"550/650","Độ vỏ/Sưởn":"300/350","Thay pin":"450","Kính Camera sau":"450","Camera trước":"550","Camera sau":"550","Dây chân sạc":"350","Dây cảm biến":"350","Dây nguồn / Dây volume":"450","Thay rung":"350","Loa trong":"350","Loa ngoài":"350","Anten wifi":"700","IC nguồn":"700","Audio Main":"700","Hiển thị / Cảm ứng":"700","Cảm biến":"700","Camera Main":"800","IC sống / Mặt imei":"800","USB sạc":"700","IC wifi":"1000","IC đèn":"1000","Face ID":"Call","Mở icloud":"Call"},"IPHONE 14 PM":{"Ép kính / Ép cảm ứng":"700","Màn hình":"700","Phản quang":"500/550","Kính lưng":"550/600","Thay vỏ/Sưởn":"600/700","Độ vỏ/Sưởn":"350/400","Thay pin":"500","Kính Camera sau":"500","Camera trước":"600","Camera sau":"600","Dây chân sạc":"400","Dây cảm biến":"400","Dây nguồn / Dây volume":"500","Thay rung":"400","Loa trong":"400","Loa ngoài":"400","Anten wifi":"800","IC nguồn":"800","Audio Main":"800","Hiển thị / Cảm ứng":"800","Cảm biến":"800","Camera Main":"900","IC sống / Mặt imei":"900","USB sạc":"800","IC wifi":"1100","IC đèn":"1100","Face ID":"Call","Mở icloud":"Call"},"IPHONE 15":{"Ép kính / Ép cảm ứng":"700","Màn hình":"700","Phản quang":"550/600","Kính lưng":"600/650","Thay vỏ/Sưởn":"650/750","Độ vỏ/Sưởn":"400/450","Thay pin":"500","Kính Camera sau":"500","Camera trước":"600","Camera sau":"600","Dây chân sạc":"400","Dây cảm biến":"400","Dây nguồn / Dây volume":"500","Thay rung":"400","Loa trong":"400","Loa ngoài":"400","Anten wifi":"800","IC nguồn":"800","Audio Main":"800","Hiển thị / Cảm ứng":"800","Cảm biến":"800","Camera Main":"900","IC sống / Mặt imei":"900","USB sạc":"800","IC wifi":"1100","IC đèn":"1100","Face ID":"Call","Mở icloud":"Call"},"IPHONE 15 PM":{"Ép kính / Ép cảm ứng":"800","Màn hình":"800","Phản quang":"600/650","Kính lưng":"650/700","Thay vỏ/Sưởn":"700/800","Độ vỏ/Sưởn":"450/500","Thay pin":"550","Kính Camera sau":"550","Camera trước":"650","Camera sau":"650","Dây chân sạc":"450","Dây cảm biến":"450","Dây nguồn / Dây volume":"550","Thay rung":"450","Loa trong":"450","Loa ngoài":"450","Anten wifi":"900","IC nguồn":"900","Audio Main":"900","Hiển thị / Cảm ứng":"900","Cảm biến":"900","Camera Main":"1000","IC sống / Mặt imei":"1000","USB sạc":"900","IC wifi":"1200","IC đèn":"1200","Face ID":"Call","Mở icloud":"Call"},"IPHONE 16":{"Ép kính / Ép cảm ứng":"700","Màn hình":"700","Phản quang":"500/550","Kính lưng":"550/600","Thay vỏ/Sưởn":"650/750","Độ vỏ/Sưởn":"400/450","Thay pin":"550","Kính Camera sau":"550","Camera trước":"650","Camera sau":"650","Dây chân sạc":"400","Dây cảm biến":"400","Dây nguồn / Dây volume":"550","Thay rung":"400","Loa trong":"400","Loa ngoài":"400","Anten wifi":"800","IC nguồn":"800","Audio Main":"800","Hiển thị / Cảm ứng":"800","Cảm biến":"800","Camera Main":"900","IC sống / Mặt imei":"900","USB sạc":"800","IC wifi":"1100","IC đèn":"1100","Face ID":"Call","Mở icloud":"Call"},"IPHONE 16 PRO":{"Ép kính / Ép cảm ứng":"800","Màn hình":"800","Phản quang":"600/650","Kính lưng":"650/700","Thay vỏ/Sưởn":"750/850","Độ vỏ/Sưởn":"450/500","Thay pin":"600","Kính Camera sau":"600","Camera trước":"750","Camera sau":"750","Dây chân sạc":"450","Dây cảm biến":"450","Dây nguồn / Dây volume":"600","Thay rung":"450","Loa trong":"450","Loa ngoài":"450","Anten wifi":"900","IC nguồn":"900","Audio Main":"900","Hiển thị / Cảm ứng":"900","Cảm biến":"900","Camera Main":"1000","IC sống / Mặt imei":"1000","USB sạc":"900","IC wifi":"1200","IC đèn":"1200","Face ID":"Call","Mở icloud":"Call"},"IPHONE 16 PRO MAX":{"Ép kính / Ép cảm ứng":"900","Màn hình":"900","Phản quang":"650/700","Kính lưng":"700/750","Thay vỏ/Sưởn":"800/900","Độ vỏ/Sưởn":"500/550","Thay pin":"650","Kính Camera sau":"650","Camera trước":"800","Camera sau":"800","Dây chân sạc":"500","Dây cảm biến":"500","Dây nguồn / Dây volume":"650","Thay rung":"500","Loa trong":"500","Loa ngoài":"500","Anten wifi":"1000","IC nguồn":"1000","Audio Main":"1000","Hiển thị / Cảm ứng":"1000","Cảm biến":"1000","Camera Main":"1100","IC sống / Mặt imei":"1100","USB sạc":"1000","IC wifi":"1300","IC đèn":"1300","Face ID":"Call","Mở icloud":"Call"},"IPHONE 17":{"Ép kính / Ép cảm ứng":"750","Màn hình":"750","Phản quang":"550/600","Kính lưng":"600/650","Thay vỏ/Sưởn":"700/800","Độ vỏ/Sưởn":"450/500","Thay pin":"600","Kính Camera sau":"600","Camera trước":"700","Camera sau":"700","Dây chân sạc":"450","Dây cảm biến":"450","Dây nguồn / Dây volume":"600","Thay rung":"450","Loa trong":"450","Loa ngoài":"450","Anten wifi":"900","IC nguồn":"900","Audio Main":"900","Hiển thị / Cảm ứng":"900","Cảm biến":"900","Camera Main":"1000","IC sống / Mặt imei":"1000","USB sạc":"900","IC wifi":"1200","IC đèn":"1200","Face ID":"Call","Mở icloud":"Call"},"IPHONE 17 PRO":{"Ép kính / Ép cảm ứng":"850","Màn hình":"850","Phản quang":"650/700","Kính lưng":"700/750","Thay vỏ/Sưởn":"800/900","Độ vỏ/Sưởn":"500/550","Thay pin":"650","Kính Camera sau":"650","Camera trước":"800","Camera sau":"800","Dây chân sạc":"500","Dây cảm biến":"500","Dây nguồn / Dây volume":"650","Thay rung":"500","Loa trong":"500","Loa ngoài":"500","Anten wifi":"1000","IC nguồn":"1000","Audio Main":"1000","Hiển thị / Cảm ứng":"1000","Cảm biến":"1000","Camera Main":"1100","IC sống / Mặt imei":"1100","USB sạc":"1000","IC wifi":"1300","IC đèn":"1300","Face ID":"Call","Mở icloud":"Call"},"IPHONE 17 PRO MAX":{"Ép kính / Ép cảm ứng":"950","Màn hình":"950","Phản quang":"700/750","Kính lưng":"750/800","Thay vỏ/Sưởn":"900/1000","Độ vỏ/Sưởn":"550/600","Thay pin":"700","Kính Camera sau":"700","Camera trước":"900","Camera sau":"900","Dây chân sạc":"550","Dây cảm biến":"550","Dây nguồn / Dây volume":"700","Thay rung":"550","Loa trong":"550","Loa ngoài":"550","Anten wifi":"1100","IC nguồn":"1100","Audio Main":"1100","Hiển thị / Cảm ứng":"1100","Cảm biến":"1100","Camera Main":"1200","IC sống / Mặt imei":"1200","USB sạc":"1100","IC wifi":"1400","IC đèn":"1400","Face ID":"Call","Mở icloud":"Call"}};

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
  `\n\n📅 Anh/chị muốn đặt lịch, vui lòng nhắn giúp em "Tên - SĐT - lỗi máy", bên em sẽ gọi lại tư vấn ngay ạ.` +
  `\n📞 Hotline: ${SHOP.phone}\n📍 ${SHOP.address}\n⏰ ${SHOP.hours}`;

const NOTE = '\nGiá trên là tiền công sửa, bên em kiểm tra máy miễn phí và bảo hành 6 - 12 tháng ạ.';

// --- Bán máy: new nguyên seal + máy có sẵn 99% ---
// Dữ liệu lấy từ file Excel "KHO MÁY NEW - 99% KHANG HUY.xlsx" qua kho-may.ps1 (không có IMEI).
const KHO = {"updated":"24/10/2026","items":[{"s":"n","c":"iphone","n":"iPhone Duo 256G Night X/A - Full VAT","p":72500000,"st":"Actived 23/10","o":"V.NAM","note":"Có VAT được BH 12 tháng miễn phí"},{"s":"n","c":"iphone","n":"iPhone Duo 256G White X/A - Full VAT","p":76000000,"st":"Actived 23/10","o":"V.NAM","note":"Có VAT được BH 12 tháng miễn phí"},{"s":"n","c":"iphone","n":"iPhone Duo 256G Night X/A - VN","p":75000000,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 256G White X/A - VN","p":78000000,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 256G White X/A - SG","p":77000000,"st":"Chưa Active","o":"SING","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 256G Night X/A - VN","p":72500000,"st":"Actived 23/10","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 256G White X/A - VN","p":76000000,"st":"Actived 23/10","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 512G Night X/A - VN","p":94000000,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 512G Night X/A - SG","p":93000000,"st":"Chưa Active","o":"SING","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 512G White X/A - VN","p":98000000,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 512G Night X/A - VN","p":89000000,"st":"Actived 23/10","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 512G White X/A - VN","p":96500000,"st":"Actived 23/10","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 1TB Night X/A - VN","p":0,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 1TB White X/A - VN","p":0,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 2TB Night X/A - VN","p":121000000,"st":"Chưa Active","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"iPhone Duo 2TB Night X/A - VN","p":118000000,"st":"Actived 23/10","o":"V.NAM","note":"KHÔNG VAT =\u003e KHÔNG BAO đi BH"},{"s":"n","c":"iphone","n":"18 PM - 256G Black X/A (VN) - Full VAT","p":41000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Silver X/A (VN) - Full VAT","p":42500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Blue X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Đỏ X/A (VN) - Full VAT","p":42000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Black X/A (VN)","p":42000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Black X/A (3P)","p":38900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Silver X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Blue X/A (VN)","p":42400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Đỏ X/A (VN)","p":42000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Black X/A (VN)","p":39700000,"st":"Actived 24/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Đỏ X/A (VN)","p":41500000,"st":"Actived 24/10","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Black LL (MỸ )","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Silver LL (MỸ )","p":40700000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Blue LL (MỸ )","p":42300000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 256G Đỏ LL (MỸ )","p":42100000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Black X/A (VN) - Full VAT","p":46200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Silver X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Blue X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G ĐỎ X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Black X/A (VN)","p":46200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Silver X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Blue X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Đỏ X/A (VN)","p":49600000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Black LL","p":43000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Silver LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 512G Đỏ B LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Black X/A - Full VAT","p":59000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Silver X/A - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Blue X/A - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Đỏ -- X/A - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Black X/A (VN)","p":59000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Silver X/A (VN)","p":61000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Blue X/A (VN)","p":61000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Đỏ -- X/A (VN)","p":61000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Black X/A (VN)","p":57800000,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Silver X/A (VN)","p":60000000,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Blue X/A (VN)","p":58800000,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Đỏ -- X/A (VN)","p":58700000,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 1TB Blue LL","p":55800000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Black X/A (VN) -Full VAT","p":73000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Silver X/A (VN) - Full VAT","p":79000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Blue X/A (VN) - Full VAT","p":79500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Đỏ -- X/A (VN) - Full VAT","p":79500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Black X/A (VN)","p":72000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Silver X/A (VN)","p":78000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Blue X/A (VN)","p":79500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 PM - 2TB Đỏ -- X/A (VN)","p":79500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Black X/A (VN) -Full VAT","p":39400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Silver X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Blue X/A (VN) - Full VAT","p":39200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Đỏ Bu X/A (VN) -Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Black X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Silver X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Blue X/A (VN)","p":38900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Đỏ Bu X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Black X/A (VN)","p":0,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Đỏ Bu X/A (VN)","p":0,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Black LL","p":34800000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Silver LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Blue LL","p":37400000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G ĐỏSẫm LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 256G Black LL","p":35600000,"st":"Actived T10","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Black X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Silver X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Blue X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G ĐỏSẫm X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Black X/A (VN)","p":0,"st":"Actived 18/9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Silver X/A (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Blue X/A (VN)","p":45600000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Đỏ X/A (VN)","p":45500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Black LL","p":43300000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Silver LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G ĐỏSẫm LL","p":44800000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 512G Black LL","p":41700000,"st":"Actived 12/10","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 1TB Black X/A (VN) - Full VAT","p":56800000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 1TB Silver X/A (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 1TB Blue X/A (VN)","p":53900000,"st":"Active T9","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 1TB Black LL","p":52200000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro- 1TB Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Black X/A (VN) - Full VAT","p":75400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Silver X/A (VN) - Full VAT","p":71000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Blue X/A (VN) - Full VAT","p":75400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB ĐỏSẫm X/A (VN) - Full VAT","p":75400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Black X/A (VN)","p":74000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Silver X/A (VN)","p":71000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB Blue X/A (VN)","p":75300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"18 Pro - 2TB ĐỏSẫm X/A (VN)","p":75300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Silver ZP (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Blue ZP (VN) - Full VAT","p":34400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam ZP (VN) - Full VAT","p":34300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Silver ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Blue ZP (VN)","p":33800000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam ZP (VN)","p":32800000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam ZP (VN)","p":32000000,"st":"Active T10","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Silver LL","p":34100000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Blue LL","p":31400000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam LL","p":32100000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Blue LL","p":31000000,"st":"Active T8","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Blue LL","p":30600000,"st":"Active T7","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam LL","p":31600000,"st":"Active T8","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 256G Cam LL","p":31700000,"st":"Active T9","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Silver ZP (VN) - Full VAT","p":41000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G BLUE ZP (VN) - Full VAT","p":41000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Cam ZP (VN) - Full VAT","p":40700000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Silver ZP (VN)","p":40400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Cam ZP (VN)","p":39800000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Cam ZP (VN)","p":38900000,"st":"Active T10","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Silver LL","p":39000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Blue LL","p":38700000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Cam LL","p":37700000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Blue LL","p":37500000,"st":"Active T8","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 512G Blue LL","p":37400000,"st":"Active T7","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 1TB Cam ZP (VN)","p":44500000,"st":"Active 03/8","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 1TB Cam ZP (VN)","p":45000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 1TB Silver LL","p":42000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 1TB Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 1TB Cam LL","p":40600000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 2TB Silver LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 2TB Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 PM - 2TB Cam LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Silver ZP (VN) Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Blue ZP (VN) Full VAT","p":31700000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Cam ZP (VN) Full VAT","p":31900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Silver VN","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Cam VN","p":31500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Blue LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Cam LL","p":30000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Blue LL","p":30000000,"st":"Actived T9","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 256G Cam LL","p":29600000,"st":"Actived T4","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 512G Silver ZP (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 512G Blue ZP (VN) - Full VAT","p":38500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 512G Cam ZP (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 512G BlueLL","p":35000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 512G Cam LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 1TB Silver ZP (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 1TB Blue ZP (VN) - Full VAT","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Pro - 1TB Blue ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G Blue ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G Gold ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G White ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G Black LL","p":24200000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G Blue LL","p":24200000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 Air - 256G Gold LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G Black ZP (VN) - Full VAT","p":27300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G BLUE ZP (VN) - Full VAT","p":27300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G Tím ZP (VN) - Full VAT","p":27300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G SAGE ZP (VN) - Full VAT","p":27300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G White ZP (VN) - Full VAT","p":27300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G BLUE ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G Tím ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G SAGE ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G Black ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G WHITE ZP (VN)","p":0,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G BLUE LL","p":24600000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G Tím LL","p":24700000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G SAGE LL","p":25500000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G BLACK LL","p":23600000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17 - 256G BLACK LL","p":23200000,"st":"Acti T7","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17E - 256G WHITE VN","p":19200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"17E - 256G BLACK VN","p":19200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 PM - 256G BLACK LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 PM - 256G Desert LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 PM - 256G BLACK CPO","p":0,"st":"Chưa Active","o":"VC","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 PM - 256G NATUR CPO","p":0,"st":"Chưa Active","o":"VC","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 PM - 256G Desert CPO","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 Pro - 128G BLACK LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 Pro - 128G NATUR LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 Plus - 128G Black - VN","p":22500000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 Plus - 128G Pink - VN","p":24400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 Plus - 256G Pink - VN","p":25800000,"st":"Acti T10","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Silver VN - CÓ VAT","p":24000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Pink VN - CÓ VAT","p":24000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Teal VN - CÓ VAT","p":24000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Black VN","p":21400000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Pink VN","p":21000000,"st":"Acti 4/10","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Black LL","p":17600000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G BLUE LL","p":20000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"16 - 128G Pink LL","p":19800000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 128G Black VN VAT","p":20900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 128G BLUE VN VAT","p":20900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 128G Pink VN VAT","p":20900000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 256G Pink VN VAT","p":24000000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 128G Black VN","p":19200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 128G Pink VN","p":19200000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"iphone","n":"15 - 256G Pink VN","p":22300000,"st":"Chưa Active","o":"V.NAM","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF 256 - BLACK VN - Full VAT","p":32900000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF 256 - SILVER VN - Full VAT","p":32900000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - LTE - 256G - BLACK VN","p":36400000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - LTE - 256G - SILVER VN","p":36400000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF 256G - BLACK LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF 256G - SILVER LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - LTE - 256GB - BLACK LL","p":32000000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF- 512GB - BLACK LL","p":35900000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF - 512GB - SILVER LL","p":36200000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF - 512GB - SILVER KH","p":36000000,"st":"Chưa Active","o":"KH/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - 5G - 1TB -SILVER LL nano","p":49000000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 11\u0027 M5 - WF - 2TB - BLACK LL","p":52000000,"st":"Chưa Active","o":"","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 256G - BLACK LL","p":35000000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 256G - SILVER LL","p":36000000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 512G - BLACK LL","p":39900000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 512G - SILVER LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 1T - BLACK LL Nano","p":50500000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 1T - BLACK LL Lock","p":45500000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 2T - BLACK LL","p":49500000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 2T - BLACK LL Nano","p":50500000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - 5G 2T - SILVER LL Nano","p":56300000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - WF 256 - BLACK LL","p":33200000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - WF 256 - SILVER LL","p":33800000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - WF 512 - BLACK LL","p":39000000,"st":"Actived T3","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"iPad Pro 13\u0027 M5 - WF 512 - SILVER LL","p":40000000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"13\u0027\u0027 M4 (2024) - 256GB GRAY LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"11\u0027\u0027 M1 (2021) - WFI - 256GB GRAY LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 13\" M4 5G 128 - GRAY LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 13\" M4 FW 128- GRAY LL","p":22900000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 13\" M4 FW 128- STAR LL","p":22900000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 13\" M4 FW 256- STAR LL","p":26500000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 FW 128- GRAY VN Full VAT","p":19300000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 FW 128- BLUE VN Full VAT","p":19300000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 FW 128- STAR VN Full VAT","p":19300000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 FW 256- GRAY VN Full VAT","p":22400000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 5G 128- BLUE VN","p":22600000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" M4 5G 128- STAR VN","p":22600000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 8 - 11\" 5G - 512- GRAY LL","p":32200000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 7 - 11\" LTE- 128GB GRAY LL","p":19000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 7 - 11\" LTE- 128GB BLUE LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Air 7 - 11\" LTE- 512GB BLUE LL","p":28000000,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Mini 7 - Wifi - 128G GRAY LL","p":14700000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Mini 7 - Wifi - 128G BLUE LL","p":14700000,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Mini 7 - Wifi - 128G Purple LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Mini 7 - Wifi - 128G Starlight LL","p":0,"st":"Chưa Active","o":"LL/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G BLUE VN - CÓ VAT","p":12800000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G SILVER VN - CÓ VAT","p":12600000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G PINK VN - CÓ VAT","p":12800000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G YELLO VN- CÓ VAT","p":12800000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 256G PINK VN - CÓ VAT","p":16000000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 256G SILVER VN - CÓ VAT","p":16000000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G BLUE VN","p":12200000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G SILVER VN","p":12200000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G PINK VN","p":12300000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 256G PINK VN","p":14700000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 256G BLUE VN","p":14600000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 256G SILVER VN","p":14600000,"st":"Chưa Active","o":"ZA/A","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G SILVER LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G PINK LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"n","c":"ipad","n":"Gen 11 - Wifi 128G BLUE LL","p":0,"st":"Chưa Active","o":"USA","note":"BH 12 tháng"},{"s":"u","c":"iphone","n":"IP 18 PROMAX X/A NEW ACTIVE","p":47500000,"col":"XANH","cap":"512GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IP 18 PROMAX X/A NEW ACTIVE","p":41500000,"col":"ĐỎ","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99% SẠC 173","p":34500000,"col":"CAM","cap":"512GB","pin":"98%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99%","p":34000000,"col":"CAM","cap":"512GB","pin":"91%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99% SẠC 272","p":34500000,"col":"CAM","cap":"512GB","pin":"94%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99% SẠC 357","p":34000000,"col":"CAM","cap":"512GB","pin":"91%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX LL/A 99%","p":34500000,"col":"XANH","cap":"512GB","pin":"98%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99%","p":35500000,"col":"TRẮNG","cap":"512GB","pin":"92%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX LL/A 99%","p":34500000,"col":"TRẮNG","cap":"512GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99%","p":30500000,"col":"TRẮNG","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IP 17 PROMAX ZP/A 99%","p":29800000,"col":"TRẮNG","cap":"256GB","pin":"89%","note":""},{"s":"u","c":"iphone","n":"IP 17 PRO LL/A 99%","p":27500000,"col":"TRẮNG","cap":"256GB","pin":"96%","note":""},{"s":"u","c":"iphone","n":"IP 17 ZP/A 98%","p":19500000,"col":"TÍM","cap":"256GB","pin":"92%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX ZA/A 99%","p":25000000,"col":"TRẮNG","cap":"256GB","pin":"87%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX LL/A 98%","p":24200000,"col":"TRẮNG","cap":"256GB","pin":"87%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX LL/A 98%","p":24200000,"col":"TRẮNG","cap":"256GB","pin":"86%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX VN/A 99%","p":25000000,"col":"SA MẠC","cap":"256GB","pin":"89%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX VN/A 99%","p":25000000,"col":"SA MẠC","cap":"256GB","pin":"86%","note":""},{"s":"u","c":"iphone","n":"IP 16 PROMAX LL/A 98%","p":27500000,"col":"SA MẠC","cap":"1TB","pin":"88%","note":""},{"s":"u","c":"iphone","n":"15 PRO VN/A 99%","p":14800000,"col":"NATURE","cap":"128GB","pin":"83%","note":""},{"s":"u","c":"iphone","n":"15 PROMAX VN/A 99% TMZ","p":16500000,"col":"NATURE","cap":"256GB","pin":"90%","note":"THAY MÀN ZIN + PIN ZIN 91%"},{"s":"u","c":"iphone","n":"14 PROMAX ZD/A 98%","p":15500000,"col":"TÍM","cap":"128GB","pin":"85%","note":""},{"s":"u","c":"iphone","n":"14 PROMAX ZP/A 98% (NHĂM SƯỜN)","p":14500000,"col":"TÍM","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"13 PA/A 99%","p":8500000,"col":"TRẮNG","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"13 VN/A 99%","p":8500000,"col":"TRẮNG","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"13 PROMAX J/A 98%","p":10500000,"col":"XANH","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PRO VN/A 99%","p":8500000,"col":"XANH","cap":"512GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PRO LL/A 98% BLOCK","p":2200000,"col":"ĐEN","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX LL/A 98%","p":9500000,"col":"XANH","cap":"128GB","pin":"97%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX LLA 98%-","p":11500000,"col":"GOLD","cap":"256GB","pin":"91%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX TA/A 99%-","p":11500000,"col":"XANH","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX ZA/A 99%-","p":11500000,"col":"XANH","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX LL/A 99% TMZ, TV","p":10500000,"col":"XANH","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"12 PROMAX LL/A 98%","p":13500000,"col":"ĐEN","cap":"512GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IPHONE 11 X/A 98%","p":5500000,"col":"TÍM","cap":"128GB","pin":"9X%","note":"THAY MÀN ZIN"},{"s":"u","c":"iphone","n":"IPHONE 11 PROMAX LL/A 98% TM","p":7500000,"col":"TRẮNG","cap":"512GB","pin":"100%","note":"THAY LƯNG + THAY MÀN ZIN"},{"s":"u","c":"iphone","n":"IPHONE 11 PROMAX LL/A 99%","p":7500000,"col":"TRẮNG","cap":"256GB","pin":"97%","note":"THAY PIN"},{"s":"u","c":"iphone","n":"IPHONE 11 PROMAX LL/A 99%","p":6300000,"col":"GOLD","cap":"64GB","pin":"100%","note":"THAY MÀN ZIN + THAY PIN"},{"s":"u","c":"iphone","n":"IP XS 98% BLOCK","p":1800000,"col":"TRẮNG","cap":"","pin":"","note":""},{"s":"u","c":"iphone","n":"IP XS 98% J/A","p":4500000,"col":"GOLD","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"IP X - X/A 98% TM","p":3500000,"col":"TRẮNG","cap":"256GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"XSMAX LL/A 99% TV","p":4800000,"col":"ĐEN","cap":"64GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"8 PLUS LL/A 98% LOCK","p":1500000,"col":"TRẮNG","cap":"64GB","pin":"88%","note":""},{"s":"u","c":"iphone","n":"8 PLUS LL/A 98%","p":3200000,"col":"GOLD","cap":"64GB","pin":"100%","note":""},{"s":"u","c":"iphone","n":"6S PLUS LL/A 98% KO VÂN","p":1000000,"col":"GOLD","cap":"64GB","pin":"100%","note":""},{"s":"u","c":"ipad","n":"IPAD GEN 7 5G 99%","p":4500000,"col":"GRAY","cap":"128GB","pin":"100%","note":""},{"s":"u","c":"ipad","n":"IPAD PRO M2.9 99% 5G","p":16500000,"col":"GRAY","cap":"128GB","pin":"","note":""},{"s":"u","c":"mac","n":"LENOVO","p":8300000,"col":"ĐEN","cap":"","pin":"","note":""},{"s":"u","c":"mac","n":"MAC PRO 2013 98%","p":4500000,"col":"GRAY","cap":"256GB","pin":"","note":""},{"s":"u","c":"mac","n":"MAC PRO 2019 98%","p":7500000,"col":"GRAY","cap":"8/256GB","pin":"","note":""},{"s":"u","c":"mac","n":"MAC PRO M1 98%","p":10500000,"col":"GRAY","cap":"8/256GB","pin":"","note":""},{"s":"u","c":"mac","n":"LAPTOP DELL","p":10500000,"col":"BẠC","cap":"","pin":"","note":""},{"s":"u","c":"watch","n":"APPLE WATCH SR7 45MM","p":4500000,"col":"XANH","cap":"32GB","pin":"","note":""},{"s":"u","c":"watch","n":"APPLE WATCH SR5 44MM","p":2500000,"col":"ĐEN","cap":"32GB","pin":"","note":""},{"s":"u","c":"watch","n":"APPLE WATCH SR11 42MM","p":5800000,"col":"ĐEN","cap":"","pin":"","note":""},{"s":"u","c":"watch","n":"APPLE WATCH SE 2 44MM","p":3500000,"col":"XANH ĐEN","cap":"32GB","pin":"","note":""},{"s":"u","c":"samsung","n":"SS GALAXY NOTE 10 LILE 98%","p":3500000,"col":"ĐEN","cap":"","pin":"","note":""},{"s":"u","c":"samsung","n":"SS GALAXY S23 ULTRA 98%","p":13500000,"col":"XANH","cap":"","pin":"","note":""},{"s":"u","c":"samsung","n":"S26 ULTRA NEW 8/256GB","p":26800000,"col":"TÍM","cap":"","pin":"","note":""},{"s":"u","c":"samsung","n":"SAM SUNG TAB 10","p":16500000,"col":"TRẮNG","cap":"","pin":"","note":""}]};

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
  const m = t.match(/(?:^| )(?:iphone |ip |i )?(duo|xs ?max|xs|xr|x|6s plus|[6-8] plus|1[0-9]e|1[0-9])(?: (pro ?max|promax|prm|pm|pro|plus|air))?(?= |$)/);
  if (!m) return null;
  const base = m[1].replace(/ /g, '').replace('xsmax', 'xs max').replace(/^(6s|[6-8])plus$/, '$1 plus');
  let suf = (m[2] || '').replace(/ /g, '');
  if (['promax', 'prm', 'pm'].includes(suf)) suf = 'pro max';
  return suf ? `${base} ${suf}` : base;
}

function capOf(t) {
  let m = t.match(/(?:^| )(\d{2,4}) ?(?:gb|g)(?= |$)/);
  if (m) return `${m[1]}GB`;
  m = t.match(/(?:^| )([1-4]) ?(?:tb|t)(?= |$)/);
  if (m) return `${m[1]}TB`;
  m = t.match(/(?:^| )(64|128|256|512)(?= |$)/);
  return m ? `${m[1]}GB` : '';
}

function labelOf(key) {
  const words = { duo: 'Duo', pro: 'Pro', max: 'Max', plus: 'Plus', air: 'Air', xs: 'XS', xr: 'XR', x: 'X' };
  return 'iPhone ' + key.split(' ').map((w) => words[w] || w).join(' ');
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
    x.extra = [m ? m[2].replace(/SẠC\s*(\d+)/i, 'sạc $1 lần').replace(/^[-\s]+|[-\s]+$/g, '') : '', it.note].filter(Boolean).join(', ');
  }
  return x;
});

const vnd = (p) => (p > 0 ? `${p.toLocaleString('de-DE')}đ` : 'liên hệ');
const byPrice = (a, b) => (a.p || Infinity) - (b.p || Infinity);
const capNum = (c) => (parseInt(c, 10) || 0) * (/TB/.test(c) ? 1024 : 1);

const SALE_CTA =
  `\n\n📅 Anh/chị muốn xem máy hoặc giữ máy, vui lòng nhắn giúp em "Tên - SĐT", bên em sẽ gọi lại tư vấn ngay ạ.` +
  `\n📞 Hotline: ${SHOP.phone}\n📍 ${SHOP.address}`;

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
    const cols = [...new Set(g.map((x) => x.col).filter(Boolean))].join(', ');
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
  if (!cat && !key) return null;
  const intent = SALE_WORDS.test(t);
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
  if (fresh.length) parts.push(`🆕 MÁY MỚI NGUYÊN SEAL:\n${newLines(fresh, !!(cap && !capNote) || !!cat)}`);
  if (used.length) parts.push(`✨ MÁY CÓ SẴN TẠI TIỆM:\n${usedLines(used)}`);
  const repairHint = key && !intent ? `\n🔧 Anh/chị cần sửa máy, nhắn ví dụ "màn hình ${key}" để xem giá sửa ạ.` : '';
  return {
    reply:
      `Dạ, ${label} bên em đang có ạ:${capNote}\n\n${parts.join('\n\n')}\n\n` +
      `Dạ giá cập nhật ngày ${KHO.updated}, có thể thay đổi theo ngày ạ. 💳 Bên em hỗ trợ trả góp và thu cũ đổi mới ạ.${repairHint}${SALE_CTA}`,
    notify: notify(''),
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
  const model = findModel(t);
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

  const sale = saleAnswer(t, raw, sender, service);
  if (sale) return sale;

  if (model && model.key && service) {
    const v = PRICES[MODELS[model.key]][service];
    return { reply: `Dạ, ${service.toLowerCase()} ${model.label} bên em giá ${money(v)} ạ.${NOTE}${CTA}`, notify: null, withPromo: true };
  }

  if (model && model.key) {
    const rows = POPULAR.map((s) => `• ${s}: ${money(PRICES[MODELS[model.key]][s])}`).join('\n');
    return {
      reply: `Dạ, em gửi anh/chị giá sửa ${model.label} tại ${SHOP.name} ạ:\n${rows}\n\nAnh/chị cần sửa hạng mục khác cứ nhắn em, ví dụ "loa ${model.key}" ạ.${NOTE}${CTA}`,
      notify: null,
      withPromo: true,
    };
  }

  if (model && !model.key) {
    return {
      reply: `Dạ ${model.label} bên em có nhận sửa ạ. Anh/chị chờ em một chút, kỹ thuật sẽ báo giá chính xác cho anh/chị trong ít phút ạ.${CTA}`,
      notify: `❓ Khách ${sender.name || ''} hỏi máy chưa có trong bảng giá:\n"${raw}"\nTrả lời: /tl ${sender.chatId} <nội dung>`,
    };
  }

  if (service) {
    return {
      reply: `Dạ, anh/chị cho em xin đời máy để em báo giá ${service.toLowerCase()} chính xác ạ (ví dụ: "${service.toLowerCase()} 13 pro max").`,
      notify: null,
    };
  }

  if (/(^| )bao hanh( |$)/.test(t)) {
    return {
      reply: `Dạ, chính sách bảo hành của ${SHOP.name} như sau ạ:\n🛡️ Bảo hành 6 – 12 tháng tùy linh kiện\n🔄 1 đổi 1 trong 30 ngày đầu\n🔍 Kiểm tra, chẩn đoán máy miễn phí\nNếu anh/chị đã sửa máy tại tiệm, anh/chị nhắn "tra cuu bao hanh" để xem phiếu bảo hành điện tử ạ.${CTA}`,
      notify: null,
    };
  }

  const greeting = /^(hi|hello|alo|chao|xin chao|shop|ad|admin|e|em|a|anh|chi|ok|oke|cam on|thanks)( .*)?$/.test(t) || t.length < 4;
  return {
    reply:
      `Dạ, ${SHOP.name} xin chào anh/chị ạ! 📱\n` +
      `Anh/chị cần sửa máy, vui lòng nhắn giúp em tên máy và lỗi để em báo giá ngay ạ, ví dụ:\n• "màn hình 12 pro max"\n• "thay pin 11"\n• "ép kính 14"` +
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
  // Giữ các trường khác (điểm tích lũy, voucher) khi cập nhật
  const meta = { ...(old || {}), n: name || '', f: old ? old.f : now, l: now, off: old ? !!old.off : false, ...(patch || {}) };
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
      used += 3; // tối đa: phiếu bảo hành + voucher + báo chủ tiệm
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

function presetList() {
  return PROMO_PRESETS.map(([name, body], i) => `${i + 1}. ${name}: ${body.split('\n')[1]}`).join('\n');
}

// --- Phiếu bảo hành điện tử & tự nhắc khách sau sửa ---
// Mỗi khách đã nhận máy là 1 key "f:<chatId>", metadata: n tên, m máy, d ngày nhận (ms), s số mốc nhắc đã gửi.

const DAY = 86400000;
const WARRANTY_WORDS = /^(kich hoat|kich hoat bao hanh|nhan may|da nhan may)( |$)/;
const STOP_REMIND_WORDS = /^(huy nhac|tat nhac)$/;
const LOOKUP_WORDS = /^(tra cuu bao hanh|tra cuu|phieu bao hanh|xem bao hanh)$/;

const vnDayStart = (ts) => Math.floor((ts + 7 * 3600000) / DAY) * DAY;
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(ts) {
  const d = new Date(vnDayStart(ts));
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// [số ngày sau khi nhận máy, nội dung tin]
const FOLLOWUPS = [
  [7, (r) => `Dạ ${SHOP.name} xin chào anh/chị${r.n ? ' ' + r.n : ''} ạ! Máy ${r.m || 'của anh/chị'} sửa tại tiệm mình dùng có ổn định không ạ? Nếu có gì bất thường, anh/chị nhắn em ngay để bên em hỗ trợ ạ.\nNếu anh/chị hài lòng, anh/chị đánh giá giúp tiệm trên Google Maps với ạ. Em cảm ơn anh/chị nhiều! 🙏`],
  [27, (r) => `⏰ Dạ em xin nhắc anh/chị: máy ${r.m || 'của anh/chị'} còn 3 ngày nữa là hết hạn 1 đổi 1 (đến ${fmtDate(r.d + 30 * DAY)}) ạ. Nếu máy có lỗi gì, anh/chị ghé ${SHOP.name} để bên em kiểm tra miễn phí trước ngày này ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone}`],
  [180, (r) => `🔧 Dạ đã 6 tháng từ lần anh/chị sửa máy ${r.m || ''} tại ${SHOP.name} ạ. Bên em kính mời anh/chị ghé vệ sinh máy và kiểm tra pin, chẩn đoán máy miễn phí ạ.\n📍 ${SHOP.address} | 📞 ${SHOP.phone} | ${SHOP.hours}`],
];

function warrantyCard(r) {
  return (
    `🛡️ PHIẾU BẢO HÀNH ĐIỆN TỬ – ${SHOP.name.toUpperCase()}\n` +
    `Khách: ${r.n || '(không tên)'}\nMáy: ${r.m || '(chưa ghi)'}\nNgày nhận máy: ${fmtDate(r.d)}\n` +
    `• 1 đổi 1 đến hết ${fmtDate(r.d + 30 * DAY)}\n• Bảo hành 6 – 12 tháng tùy linh kiện\n\n` +
    `Dạ anh/chị giữ tin nhắn này làm phiếu bảo hành giúp em ạ (nhắn "tra cuu bao hanh" để xem lại). Bên em sẽ hỏi thăm sau 7 ngày, nhắc trước khi hết hạn 1 đổi 1 và mời kiểm tra máy sau 6 tháng ` +
    `(nhắn "huy nhac" nếu không muốn nhận).\n📞 ${SHOP.phone}`
  );
}

// Lưu (hoặc làm mới nếu sửa lần nữa) lịch nhắc cho khách, trả về bản ghi
async function registerWarranty(env, chatId, name, model) {
  const r = { n: (name || '').slice(0, 60), m: (model || '').slice(0, 60), d: Date.now(), s: 0 };
  await env.DB.put(`f:${chatId}`, '', { metadata: r });
  return r;
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
  if (s.voucher) return `⭐ Tích điểm: đủ ${STAMPS_NEEDED}/${STAMPS_NEEDED} lần sửa – dạ anh/chị được tặng voucher ạ!`;
  return `⭐ Tích điểm: ${s.p}/${STAMPS_NEEDED} lần sửa. Dạ đủ ${STAMPS_NEEDED} lần anh/chị được ${REWARD} ạ.`;
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

const OWNER_HELP =
  'Chào chủ tiệm 👋\n' +
  '• /kmmau: xem các mẫu khuyến mãi soạn sẵn\n' +
  '• /km <số>: gửi mẫu đó cho TẤT CẢ khách (VD: /km 4, gộp nhiều mẫu: /km 4 5 6)\n' +
  '• /km <nội dung>: gửi khuyến mãi tự soạn cho TẤT CẢ khách + bot tự kèm khi trả lời giá\n' +
  '• /kmxem: xem khuyến mãi đang chạy\n' +
  '• /kmxoa: tắt khuyến mãi\n' +
  '• /khach: đếm số khách\n' +
  '• /giao <mã khách> <tên máy>: gửi phiếu bảo hành + bật tự nhắc sau sửa cho khách đó\n' +
  '• /nhac: đếm khách đang được tự nhắc sau sửa\n' +
  '• /dung <mã voucher>: kiểm tra và đánh dấu voucher khách quen đã dùng\n' +
  '• /diem <mã khách>: xem điểm tích lũy của khách\n' +
  '• /tl <chat_id> <nội dung>: trả lời 1 khách\n' +
  'Các tin báo đơn sẽ gửi về đây.';

async function onOwner(env, chatId, text) {
  const reply = (s) => send(env, chatId, s);
  const m = text.match(/^\/tl\s+(\S+)\s+([\s\S]+)/);
  if (m) {
    const r = await send(env, m[1], m[2]);
    return reply(r && r.ok ? '✅ Đã gửi cho khách.' : `❌ Gửi lỗi: ${JSON.stringify(r)}`);
  }
  if (!/^\/(km|kmmau|kmxem|kmxoa|khach|giao|nhac|dung|diem)\b/.test(text)) return reply(OWNER_HELP);
  if (text === '/kmmau') {
    return reply(`📋 MẪU KHUYẾN MÃI SOẠN SẴN\n\n${presetList()}\n\nGửi cho tất cả khách: /km <số>\nVD: /km 4 hoặc gộp /km 4 5 6`);
  }
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
  const g = text.match(/^\/giao\s+(\S+)\s*([\s\S]*)/);
  if (g) {
    const { metadata: c } = await env.DB.getWithMetadata(`c:${g[1]}`);
    const r = await registerWarranty(env, g[1], c && c.n, g[2].trim());
    const s = await addStamp(env, g[1], c && c.n);
    const sent = await send(env, g[1], `${warrantyCard(r)}\n\n${stampLine(s)}`);
    if (sent && sent.ok && s.voucher) await send(env, g[1], voucherMessage(s.voucher));
    const pts = s.voucher ? `đủ ${STAMPS_NEEDED}, đã tặng voucher ${s.voucher}` : `${s.p}/${STAMPS_NEEDED}${s.skipped ? ' (không cộng: đã cộng trong 7 ngày qua)' : ''}`;
    return reply(sent && sent.ok
      ? `✅ Đã gửi phiếu bảo hành và bật tự nhắc cho khách ${r.n || g[1]} (máy ${r.m || 'chưa ghi'}).\n⭐ Điểm: ${pts}`
      : `❌ Không gửi được cho mã khách ${g[1]}. Khách phải nhắn bot ít nhất 1 lần, và mã phải lấy từ tin báo đơn.`);
  }
  if (/^\/giao\b/.test(text)) return reply('Gõ: /giao <mã khách> <tên máy>\nVD: /giao 1234abcd iPhone 13 Pro\nMã khách có trong tin báo đơn.');
  let promo = text.replace(/^\/km\s*/, '').trim();
  if (!promo) return reply('Gõ: /km <số mẫu> hoặc /km <nội dung khuyến mãi>\nVD: /km 4 hoặc /km Giảm 20% thay pin đến hết 30/11\nXem mẫu: /kmmau');
  // Chỉ toàn số (VD "4" hoặc "4 5 6") => dùng mẫu soạn sẵn
  if (/^[\d\s,]+$/.test(promo)) {
    const nums = promo.split(/[\s,]+/).filter(Boolean).map(Number);
    const bad = nums.filter((n) => !PROMO_PRESETS[n - 1]);
    if (bad.length) return reply(`❌ Không có mẫu số ${bad.join(', ')}. Có mẫu từ 1 đến ${PROMO_PRESETS.length}, xem: /kmmau`);
    promo = [...new Set(nums)].map((n) => PROMO_PRESETS[n - 1][1]).join('\n\n');
  }
  await env.DB.put('promo', promo.slice(0, 1500));
  await env.DB.put('bc', JSON.stringify({ text: promo.slice(0, 1500), cursor: null, sent: 0, failed: 0 }));
  const { total, off } = await countCustomers(env);
  return reply(`✅ Đã lưu khuyến mãi. Bot đang gửi cho ${total - off} khách, xong sẽ báo lại (mỗi phút ${BATCH} khách, chỉ gửi 8h-21h).\n\nXem trước tin khách nhận:\n\n${promoMessage(promo)}`);
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
    return send(env, chatId, 'Dạ bên em đã ngừng gửi tin khuyến mãi cho anh/chị ạ. Khi nào anh/chị muốn nhận lại, anh/chị nhắn "nhan km" giúp em ạ.');
  }
  if (START_WORDS.test(t)) {
    await saveCustomer(env, chatId, sender.name, { off: false });
    return send(env, chatId, `✅ Dạ, anh/chị sẽ nhận được tin khuyến mãi mới nhất từ ${SHOP.name} ạ. Em cảm ơn anh/chị!`);
  }
  await saveCustomer(env, chatId, sender.name);

  if (STOP_REMIND_WORDS.test(t)) {
    if (env.DB) await env.DB.delete(`f:${chatId}`);
    return send(env, chatId, 'Dạ bên em đã tắt tin nhắc sau sửa máy ạ. Phiếu bảo hành của anh/chị vẫn còn hiệu lực đầy đủ ạ.');
  }
  if (env.DB && POINT_WORDS.test(t)) return send(env, chatId, await pointsInfo(env, chatId));
  // Khách tự tra cứu phiếu bảo hành (học Điện Thoại Vui: tra cứu bảo hành online)
  if (env.DB && LOOKUP_WORDS.test(t)) {
    const { metadata: r } = await env.DB.getWithMetadata(`f:${chatId}`);
    return send(env, chatId, r
      ? warrantyCard(r)
      : `Dạ em chưa tìm thấy phiếu bảo hành điện tử của anh/chị ạ (phiếu được lưu 6 tháng kể từ ngày nhận máy). Anh/chị vui lòng gọi ${SHOP.phone} để bên em tra theo số điện thoại giúp anh/chị ạ.`);
  }
  // Khách nhắn "nhận máy iPhone 13" lúc lấy máy => phiếu bảo hành điện tử + tự nhắc
  if (env.DB && WARRANTY_WORDS.test(t)) {
    const model = findModel(t);
    const rest = text.replace(/^\s*(kích hoạt bảo hành|kich hoat bao hanh|kích hoạt|kich hoat|đã nhận máy|da nhan may|nhận máy|nhan may)\s*/i, '');
    const r = await registerWarranty(env, chatId, sender.name, model ? model.label : rest);
    const s = await addStamp(env, chatId, sender.name);
    await send(env, chatId, `${warrantyCard(r)}\n\n${stampLine(s)}`);
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
    const { reply, notify } = handleText(text, sender, promo);
    await send(env, chatId, reply);
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
        let left = 46 - (await pollUpdates(env, POLL_BUDGET));
        left -= await runFollowups(env, Math.min(25, left));
        await runBroadcast(env, Math.min(BATCH, left));
      })().catch((e) => console.error(e))
    );
  },
};
