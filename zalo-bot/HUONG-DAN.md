# Hướng dẫn cài Zalo Bot cho Khang Huy Apple

Bot làm được 4 việc:

1. **Tự trả lời giá.** Khách nhắn "màn hình 12 pro max" là bot báo giá ngay theo bảng giá, 24/7.
2. **Gửi khuyến mãi cho tất cả khách.** Thầy nhắn bot `/km Giảm 20% thay pin` là mọi khách từng nhắn bot đều nhận tin. Bot cũng tự kèm khuyến mãi mỗi khi trả lời giá.
3. **Báo đơn.** Khách nhắn số điện thoại cho bot, hoặc điền form "Đặt lịch sửa" trên web, là thầy nhận tin Zalo ngay.
4. **Chuyển câu hỏi khó.** Câu nào bot không hiểu sẽ được chuyển cho thầy trả lời.

Tổng thời gian cài khoảng 25 phút. Tất cả đều **miễn phí**.

---

## Bước 1: Tạo bot trong Zalo (5 phút, làm trên điện thoại)

1. Mở Zalo, gõ tìm **Zalo Bot Manager** (tài khoản có dấu tích xanh), bấm **Quan tâm**.
2. Trong khung chat, bấm menu bên dưới rồi chọn **Tạo bot**. Màn hình **Zalo Bot Creator** sẽ mở ra.
3. Đặt tên bot, bắt buộc bắt đầu bằng chữ "Bot". Ví dụ: **Bot Khang Huy Apple**.
4. Điền thông tin còn lại rồi bấm **Tạo Bot**.
5. Zalo gửi về một tin nhắn có **Bot Token**, dạng `12345678:AbCdEf...`. Thầy chép **toàn bộ** chuỗi này, cả phần sau dấu `:`.

> ⚠️ Token giống như chìa khóa của bot. **Không gửi token cho ai** và không dán vào chat với Claude. Chỉ dán vào Cloudflare ở Bước 3.

## Bước 2: Tạo tài khoản Cloudflare (3 phút, làm trên máy tính)

Cloudflare là nơi chạy bot 24/7 miễn phí, máy tính của thầy tắt cũng không sao.

1. Vào https://dash.cloudflare.com/sign-up và đăng ký bằng email.
2. Mở email để xác nhận tài khoản.

## Bước 3: Đưa bot lên Cloudflare (5 phút)

1. Ở menu bên trái, chọn **Workers & Pages** → **Create** → **Start with Hello World!**
2. Đặt tên **khanghuyapple-bot** rồi bấm **Deploy**.
3. Bấm **Edit code**. Xóa hết code có sẵn, mở file [worker.js](worker.js) trong thư mục này, chép **toàn bộ** nội dung và dán vào, rồi bấm **Deploy**.
4. Quay lại trang của worker, vào **Settings** → **Variables and Secrets** → **Add**, rồi thêm 2 biến, mỗi biến chọn loại **Secret**:

   | Tên biến | Giá trị |
   |---|---|
   | `BOT_TOKEN` | Token Zalo ở Bước 1 |
   | `WEBHOOK_SECRET` | Thầy tự đặt một chuỗi dài, chỉ gồm chữ và số, ví dụ `KhangHuy2026BiMat`. Ghi lại để dùng ở bước sau |

5. Bấm **Deploy** để lưu.
6. Ghi lại địa chỉ worker, dạng `https://khanghuyapple-bot.crimson-recipe-0ba6.workers.dev`.

## Bước 4: Nối bot với Zalo (1 phút)

Mở trình duyệt và vào địa chỉ sau. Thay phần trong `< >` bằng giá trị của thầy:

```
https://khanghuyapple-bot.crimson-recipe-0ba6.workers.dev/setup?key=<WEBHOOK_SECRET>
```

Nếu trang hiện `"ok":true` là xong.

## Bước 5: Tạo kho lưu khách để gửi khuyến mãi (5 phút)

Bot cần một chỗ để nhớ những khách đã nhắn và nội dung khuyến mãi đang chạy.

1. Ở menu bên trái Cloudflare, chọn **Storage & Databases** → **KV** → **Create** (hoặc **Create a namespace**), đặt tên **khanghuy-db**, rồi bấm **Add/Create**.
2. Mở lại worker **khanghuyapple-bot**, vào **Settings** → **Bindings** → **Add** → **KV namespace**:
   - **Variable name**: gõ đúng `DB` (chữ in hoa)
   - **KV namespace**: chọn **khanghuy-db**
   - Bấm **Deploy** (hoặc **Save**)
3. Vẫn trong **Settings**, tìm **Trigger Events** (hoặc **Triggers**) → **Add** → **Cron Triggers**. Chọn kiểu **Every minute** (hoặc gõ `* * * * *`) rồi bấm **Add**.

> Dòng hẹn giờ này giúp bot gửi khuyến mãi theo từng đợt, mỗi phút 25 khách, để không vượt giới hạn của gói miễn phí. Ví dụ 300 khách thì khoảng 12 phút là gửi xong.

## Bước 6: Đăng ký thầy là chủ tiệm (2 phút)

1. Trong Zalo, tìm bot vừa tạo (**Bot Khang Huy Apple**) và nhắn: `/id`
2. Bot trả lời `Chat id của bạn: xxxxxxxx`. Thầy chép dãy số đó.
3. Quay lại Cloudflare, vào **Settings** → **Variables and Secrets** → **Add**, thêm biến `OWNER_CHAT_ID` với giá trị là dãy số vừa chép, rồi bấm **Deploy**.
4. Nhắn bất kỳ chữ gì cho bot. Nếu bot trả lời "Chào chủ tiệm 👋" kèm danh sách lệnh là xong.

## Bước 7: Gắn form đặt lịch trên web

Gửi cho Claude **địa chỉ worker** (chỉ địa chỉ `https://khanghuyapple-bot....workers.dev`, không gửi token). Claude sẽ gắn vào form "Đặt lịch sửa" trên trang bảng giá và đưa lên GitHub.

Thầy cũng có thể tự sửa: trong file `bang-gia-professional.html`, tìm dòng `const ORDER_API = '';` rồi điền `'https://khanghuyapple-bot.crimson-recipe-0ba6.workers.dev/order'`.

## Bước 8: Thử bot

Dùng một tài khoản Zalo khác (của người nhà chẳng hạn) để nhắn cho bot:

| Nhắn | Bot sẽ làm |
|---|---|
| `màn hình 12 pro max` | Báo giá 600.000đ, kèm khuyến mãi nếu đang có |
| `ip 13` | Báo giá 5 hạng mục hay sửa |
| `thay pin` | Hỏi lại máy đời nào |
| `có khuyến mãi không` | Gửi khuyến mãi đang chạy |
| `Lan 0912345678 vỡ màn` | Cảm ơn khách, đồng thời **báo đơn cho thầy** |
| `máy bị treo táo` | Mời khách để lại SĐT, đồng thời **chuyển câu hỏi cho thầy** |

Sau đó, từ Zalo của thầy, nhắn bot `/km Thử khuyến mãi`. Khoảng 1 phút sau, tài khoản thử sẽ nhận được tin.

---

## Thầy dùng hằng ngày thế nào

Thầy nhắn các lệnh sau cho bot, từ Zalo của thầy:

| Lệnh | Tác dụng |
|---|---|
| `/kmmau` | Xem 8 mẫu khuyến mãi soạn sẵn (bảng bên dưới) |
| `/km 4` | Gửi **mẫu số 4** cho tất cả khách |
| `/km 4 5 6` | Gộp mẫu 4, 5, 6 thành **một tin** rồi gửi cho tất cả khách |
| `/km Giảm 20% thay pin đến hết 30/11` | Gửi tin tự soạn này cho **tất cả khách**. Từ lúc đó, mỗi lần trả lời giá bot đều kèm dòng "🔥 KHUYẾN MÃI" |
| `/kmxem` | Xem khuyến mãi đang chạy |
| `/kmxoa` | Tắt khuyến mãi: bot không kèm khuyến mãi khi trả lời giá nữa |
| `/khach` | Đếm số khách đã nhắn bot |
| `/tl 1234abcd Dạ máy anh sửa 30 phút ạ` | Trả lời riêng một khách. Mã khách có sẵn trong tin báo đơn |

- Tin báo đơn và câu hỏi khó đều về khung chat của thầy với bot.
- Muốn gọi điện thì cứ gọi thẳng số khách trong tin báo đơn.
- Link bot: **https://zalo.me/904216852236717976**. Link này đã được gắn trên trang bảng giá (nút "Báo giá" màu cam). Mã QR của bot nằm trong phần thông tin bot ở Zalo. Thầy nên in mã QR ra dán ở quầy và đăng link lên Facebook. **Càng nhiều khách nhắn bot thì danh sách nhận khuyến mãi càng dài.**

### 8 mẫu khuyến mãi soạn sẵn

| Số | Nhóm | Mẫu | Nội dung khách nhận |
|---|---|---|---|
| 1 | Mua máy / Lên đời | Thu cũ đổi mới | Thu lại máy cũ giá cao, trợ giá ngay 300.000đ – 500.000đ khi lên đời máy mới |
| 2 | Mua máy / Lên đời | Quà tặng kèm | Mua điện thoại mới tặng ốp lưng, cường lực trọn đời, củ sạc nhanh chính hãng hoặc tai nghe Bluetooth |
| 3 | Mua máy / Lên đời | Trả góp 0% | Không cần trả trước, thủ tục 15 phút (chỉ cần CCCD) |
| 4 | Sửa chữa | Giảm giá sửa chữa | Giảm 20% tiền công hoặc giảm 100.000đ khi thay màn hình/pin |
| 5 | Sửa chữa | Bảo hành mở rộng | Bảo hành 6 – 12 tháng, 1 đổi 1 trong 30 ngày đầu |
| 6 | Sửa chữa | Miễn phí đi kèm | Miễn phí vệ sinh máy, dán cường lực, kiểm tra tổng quát khi đến sửa |
| 7 | Khách thân thiết | Check-in giảm giá | Giảm 100.000đ hoặc tặng nón bảo hiểm khi check-in lên Facebook/Google Maps |
| 8 | Khách thân thiết | Giờ vàng cuối tuần | Giảm giá đặc biệt Thứ 7, Chủ nhật và khung giờ vàng 12h00 |

Gợi ý gộp: `/km 1 2 3` (lên đời máy), `/km 4 5 6` (sửa chữa), `/km 7 8` (khách thân thiết).

Muốn sửa nội dung mẫu, thầy nhắn Claude. Muốn gửi nội dung khác hẳn thì dùng `/km <nội dung tự soạn>`.

### Lưu ý khi gửi khuyến mãi

- Bot chỉ gửi được cho khách **đã từng nhắn bot**. Khách chỉ có trong danh bạ điện thoại hoặc Zalo cá nhân của thầy thì bot không gửi được.
- Mỗi tin khuyến mãi đều có dòng "Nhắn huy km để ngừng nhận". Khách nhắn "huy km" thì bot thôi gửi, nhắn "nhan km" thì nhận lại.
- Mỗi tháng chỉ nên gửi 2–4 tin. Gửi dày quá, khách dễ chặn bot.

## Khi đổi giá

1. Sửa bảng giá trong `bang-gia-professional.html` (hoặc nhờ Claude sửa).
2. Nhờ Claude chạy lại `build.ps1` để tạo `worker.js` mới.
3. Vào Cloudflare → worker **khanghuyapple-bot** → **Edit code**, dán `worker.js` mới rồi bấm **Deploy**.

Danh sách khách và khuyến mãi nằm trong kho KV nên không bị mất khi dán code mới.

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Vào trang `/setup` báo "Sai key" | `key=` phải giống hệt `WEBHOOK_SECRET`, phân biệt chữ hoa và chữ thường |
| Bot không trả lời | Mở lại trang `/setup`. Kiểm tra `BOT_TOKEN` đã chép đủ cả phần sau dấu `:` chưa |
| Không nhận được tin báo đơn | Kiểm tra `OWNER_CHAT_ID`, rồi bấm **Deploy** lại sau khi thêm biến |
| Gõ `/km` mà bot báo "Chưa gắn KV" | Làm lại Bước 5, mục 2. Tên biến phải đúng là `DB` |
| Đã gõ `/km` mà khách không nhận được | Kiểm tra Cron Trigger ở Bước 5, mục 3 |
| Muốn xem lỗi chi tiết | Cloudflare → worker → **Logs** → **Begin log stream** |
