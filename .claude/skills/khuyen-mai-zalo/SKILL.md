---
name: khuyen-mai-zalo
description: Quy trình lên kế hoạch, soạn và gửi tin khuyến mãi / chăm sóc khách qua Zalo bot của tiệm Khang Huy Apple, học theo cách FPT Shop, Thế Giới Di Động, Minh Tuấn Mobile, Viettel Store. Dùng khi thầy muốn chạy khuyến mãi, soạn tin gửi khách, lên lịch khuyến mãi theo tháng/dịp lễ, sửa mẫu khuyến mãi của bot, hoặc chăm sóc khách sau sửa máy.
---

# Quy trình khuyến mãi qua Zalo – Khang Huy Apple

Thầy (chủ tiệm) gửi khuyến mãi bằng cách nhắn lệnh cho **Bot Khang Huy Apple** trên Zalo. Bot chạy ở Cloudflare Worker `khanghuyapple-bot`, code ở `zalo-bot/` trong repo này (sửa `zalo-bot/worker.template.js`, chạy `zalo-bot/build.ps1`, rồi commit và push lên `master` là bot tự cập nhật). Hướng dẫn cho thầy: `zalo-bot/HUONG-DAN.md`.

Thầy không rành kỹ thuật. Luôn trả lời bằng tiếng Việt, xưng "em", gọi "thầy", câu ngắn, đưa sẵn lệnh để thầy chép rồi gửi.

## Lệnh bot hiện có (thầy nhắn từ Zalo của thầy)

| Lệnh | Tác dụng |
|---|---|
| `/kmmau` | Xem 9 mẫu soạn sẵn |
| `/km 4` · `/km 4 5 6` | Gửi một mẫu, hoặc gộp nhiều mẫu thành 1 tin, cho tất cả khách |
| `/km <nội dung>` | Gửi tin tự soạn cho tất cả khách. Bot kèm khuyến mãi này khi trả lời giá |
| `/kmxem` · `/kmxoa` | Xem / tắt khuyến mãi đang chạy |
| `/khach` | Đếm khách đã nhắn bot và khách đang nhận khuyến mãi |
| `/tl <mã khách> <nội dung>` | Nhắn riêng 1 khách (mã có trong tin báo đơn) |
| `/giao <mã khách> <tên máy>` | Gửi phiếu bảo hành điện tử và bật tự nhắc sau sửa cho khách đó |
| `/nhac` | Đếm khách đang được tự nhắc sau sửa |

Khách tự nhắn `nhận máy iPhone 13` lúc lấy máy cũng được phiếu bảo hành và lịch tự nhắc (ngày 7, 27, 180, gửi lúc 9h–20h). Nhắn `huy nhac` để tắt, nhắn `tra cuu bao hanh` để xem lại phiếu. Nội dung các mốc nằm trong mảng `FOLLOWUPS`, file `zalo-bot/worker.template.js`.

**Giới hạn của bot:**
- Chỉ gửi được cho khách **đã từng nhắn bot**.
- Gửi khuyến mãi 25 khách mỗi phút, **chỉ trong 8h–21h**.
- Khách nhắn "huy km" thì không nhận khuyến mãi nữa.
- Chưa có chức năng sinh nhật hay tích điểm.

9 mẫu nằm trong mảng `PROMO_PRESETS` (file `zalo-bot/worker.template.js`): 1 Thu cũ đổi mới · 2 Quà tặng kèm · 3 Trả góp 0% · 4 Giảm giá sửa chữa · 5 Bảo hành mở rộng 6–12 tháng · 6 Miễn phí đi kèm · 7 Check-in · 8 Giờ vàng cuối tuần giảm 200.000đ · 9 Đặt lịch trước giảm 10% (tối đa 100.000đ).

## 10 nguyên tắc tối ưu nhất (rút ra từ 8 chuỗi bên dưới)

1. **Chăm sóc sau bán quan trọng ngang khuyến mãi.** TGDĐ nhắc vệ sinh định kỳ, Điện Thoại Vui cho tra cứu bảo hành. Bot đã có phiếu bảo hành điện tử, tra cứu, nhắc ngày 7/27/180.
2. **Mỗi ưu đãi có điều kiện, mức trần và hạn dùng.** FPT ghi đơn tối thiểu, không cộng dồn; Điện Thoại Vui ghi "giảm 10%, tối đa 300.000đ". Luôn ghi "tối đa …đ", "không áp dụng cùng ưu đãi khác", "đến ngày …".
3. **Khuyến khích đặt lịch trước** (Điện Thoại Vui giảm 10%). Tiệm chủ động linh kiện, khách không phải chờ. Dùng mẫu 9.
4. **Combo trọn gói khi có sự kiện** (ShopDunk khai trương: thu cũ trợ giá + trả góp 0% + dán cường lực miễn phí). Gộp `/km 1 3 6`.
5. **Có lý do để khách đăng ký thành viên** (Hoàng Hà: đăng ký Member trong giờ livestream mới được voucher). Với tiệm mình: "quét QR nhắn bot nhận ưu đãi". Danh sách khách của bot chính là danh sách thành viên.
6. **Khung giờ cố định để khách quen hẹn** (Hoàng Hà livestream tối Thứ Sáu 19h30–21h30). Tiệm mình có mẫu 8 giờ vàng 12h00 và cuối tuần. Nên giữ cố định để khách nhớ.
7. **Chạy theo mùa cao điểm và minigame** (Minh Tuấn: thu cũ đổi mới cuối năm, quay số trúng vàng, livestream công bố kết quả hằng tuần). Với tiệm nhỏ: minigame trên fanpage (đoán giá, bình luận nhận thẻ cào), công bố kết quả công khai.
8. **Tích điểm, ưu đãi khách quen** (Viettel++, Quà Tặng VIP, FPT tích điểm). Bot chưa có. Đề xuất làm sau: đếm số lần "nhận máy", lần thứ 3 giảm thêm.
9. **Dịch vụ cho khách ở xa** (Điện Thoại Vui nhận sửa qua ship, miễn phí ship 2 chiều trong 10km, hỗ trợ qua Zalo). Gợi ý thầy cân nhắc: khách ngoài khu vực nhắn bot đặt ship máy.
10. **Chống bị nghi lừa đảo.** VTV đưa tin khoảng 1.000 người bị lừa qua livestream "iPhone giá rẻ" rồi bị kéo sang Zalo. Tin của tiệm luôn có tên, địa chỉ, hotline thật; không dùng chữ "trúng thưởng", "nhấn link nhận quà"; không giá rẻ bất thường.

**Không nên:** bán iPhone mới qua livestream TikTok Shop / Shopee. Apple đã yêu cầu đại lý ngừng bán trên TikTok Shop từ 31/5/2024 và ngừng livestream trên Shopee. Livestream nên dùng để **giới thiệu dịch vụ sửa, mẹo dùng máy, minigame** trên Facebook/TikTok, rồi dẫn khách về bot Zalo hoặc tiệm.

## Từng chuỗi làm thế nào (đã tra cứu tháng 10/2026)

- **Điện Thoại Vui (chuỗi sửa chữa, giống tiệm mình nhất):**
  - tra cứu bảo hành online bằng SĐT + mã phiếu;
  - đặt lịch trước giảm 10%, có mức trần, không cộng dồn;
  - sửa từ xa qua ship;
  - hỗ trợ qua Zalo, giờ 8h–21h.
- **ShopDunk:** đại lý ủy quyền Apple, nhấn mạnh trải nghiệm thử máy tại cửa hàng. Sự kiện khai trương có combo thu cũ trợ giá tới 1,5 triệu + trả góp 0% + dán cường lực miễn phí. Không tìm thấy tài liệu về cách họ nhắn tin Zalo.
- **Hoàng Hà Mobile:**
  - livestream fanpage theo khung giờ cố định, kèm minigame, thẻ cào, đấu giá ngược;
  - hợp tác TikToker cho Black Friday;
  - gắn voucher với việc đăng ký Hoàng Hà Member.
  Không tìm thấy chính sách HSSV.
- **Viettel Store / Viettel++:** tích điểm khi dùng dịch vụ, đổi điểm lấy data, phút gọi, voucher; không đổi ra tiền mặt. Không tìm thấy tài liệu riêng về tin nhắn khuyến mãi của Viettel Store.
- **"Trai Đẹp bán iPhone":** không tìm thấy thông tin về người bán này. Bối cảnh chung là iPhone từng bán rất mạnh qua livestream TikTok (FPT Shop, Viettel Store, Di Động Việt), đến khi Apple cấm từ 2024.

- **Thế Giới Di Động:** chăm sóc khách qua app *Quà Tặng VIP*: tích điểm theo % giá trị đơn, theo dõi và đặt lịch bảo hành, **nhắc lịch vệ sinh định kỳ**. Họ cũng cảnh báo khách về tin nhắn giả danh báo "trúng thưởng".
  → Bài học: **chăm sóc sau bán** (nhắc bảo hành, vệ sinh) quan trọng ngang khuyến mãi, và tin nhắn phải xưng rõ tên tiệm, hotline để khách tin là thật.
- **FPT Shop:** chương trình khách hàng thân thiết có tích điểm. Họ gửi **voucher sinh nhật qua SMS/Zalo**, kèm **điều kiện rõ ràng**: đơn tối thiểu, không cộng dồn với trả góp 0% hay voucher khác.
  → Bài học: mỗi ưu đãi ghi **điều kiện + hạn dùng**, và cá nhân hóa theo dịp của khách.
- **Minh Tuấn Mobile:** chiến dịch cuối năm *Thu cũ đổi mới* trợ giá cao, kèm **quay số trúng vàng** cho hóa đơn từ 5 triệu. Họ **livestream công bố kết quả hằng tuần** trên fanpage, và chạy ưu đãi đặt trước khi máy mới ra mắt.
  → Bài học: chiến dịch theo **mùa cao điểm** (cuối năm, máy mới ra mắt), dùng minigame hoặc livestream để khách quay lại và chia sẻ.
- **Viettel Store:** không tìm thấy tài liệu riêng về cách họ nhắn tin. Ngành bán lẻ nói chung tách rõ hai loại tin:
  - **tin quảng cáo** (khuyến mãi, sản phẩm mới), phải có cách từ chối nhận;
  - **tin chăm sóc** (sinh nhật, điểm thưởng, khảo sát hài lòng, nhắc hết bảo hành), cá nhân hóa được.
- **Luật (Nghị định 91/2020, theo báo chí đưa tin):** chỉ gửi quảng cáo khi người nhận đồng ý; gửi từ 7h đến 22h; tối đa 3 tin trong 24 giờ cho một người; người đã từ chối thì không gửi nữa. Bot đã tuân thủ: chỉ gửi người đã nhắn bot, gửi 8h–21h, có "huy km".

## Quy trình 6 bước khi thầy muốn chạy khuyến mãi

1. **Chốt mục tiêu.** Hỏi thầy nếu chưa rõ: muốn tăng khách sửa, bán máy, hay kéo khách cũ quay lại? Áp dụng cho dòng máy nào? Từ ngày nào đến ngày nào? Điều kiện là gì (tối thiểu bao nhiêu, có cộng dồn không)?
2. **Chọn dịp** theo lịch bên dưới. Mỗi tháng nên có 1 chủ đề chính.
3. **Chọn mẫu hoặc soạn tin.** Có mẫu hợp thì đưa thầy lệnh `/km <số>`. Không có thì soạn tin theo khung bên dưới, rồi đưa thầy lệnh `/km <nội dung>` chép sẵn.
4. **Kiểm tra trước khi gửi:**
   - Con số khớp chính sách tiệm: bảo hành **6–12 tháng**; giá trong `bang-gia-professional.html` là **tiền công**.
   - Có hạn dùng.
   - Không chứa link lạ, không hứa điều tiệm không làm được.
5. **Gửi.** Mỗi tháng chỉ 2–4 tin, cách nhau ít nhất 5–7 ngày. Nên gửi sáng 9h–11h hoặc tối 19h–20h30. Bot tự gửi dần và báo lại số khách đã nhận.
6. **Đo kết quả.** Nhắc thầy:
   - nhắn `/khach` trước và sau chiến dịch;
   - đếm tin "🔔 ĐƠN MỚI" nhận được trong thời gian chạy;
   - hỏi khách đến tiệm "biết qua đâu".
   Ghi lại vào `zalo-bot/chien-dich.md` (ngày, lệnh đã gửi, số khách nhận, số đơn) để lần sau so sánh.

## Khung soạn tin khuyến mãi

```
<emoji> <TÊN ƯU ĐÃI VIẾT HOA>
<Ưu đãi chính trong 1 câu, có con số cụ thể>
⏳ Áp dụng: <từ ngày – đến ngày> | <điều kiện ngắn>
👉 Nhắn "Tên – SĐT – lỗi máy" để giữ suất / đặt lịch
```
Bot tự thêm tên tiệm, hotline 0981.308.308, địa chỉ và dòng "huy km", nên **không cần** ghi lại các thông tin này. Giữ tin dưới 500 ký tự, tối đa 3 emoji. Không viết "trúng thưởng", "nhấn link nhận quà" vì giống tin lừa đảo.

## Lịch khuyến mãi gợi ý trong năm

| Thời điểm | Chủ đề | Mẫu nên dùng |
|---|---|---|
| Tháng 1 – trước Tết | Sửa máy đón Tết, lên đời máy | 1 2 3, 4 6 |
| Sau Tết (tháng 2) | Máy rơi vỡ dịp Tết, thay pin | 4 5 |
| 8/3, 20/10 | Quà cho phái nữ (miễn phí dán cường lực) | 6 7 |
| 30/4 – 1/5, 2/9 | Nghỉ lễ, giờ vàng | 8 |
| Tháng 6 – 8 (hè, tựu trường) | Học sinh, sinh viên: giảm tiền công, trả góp | 3 4 |
| Tháng 9 – 10 (iPhone mới ra mắt) | Thu cũ đổi mới, lên đời | 1 2 3 |
| 11/11, Black Friday, 12/12 | Giờ vàng, giảm sâu | 4 8 |
| Mỗi cuối tuần | Giờ vàng 12h00 | 8 |

## Chăm sóc sau sửa (học TGDĐ, FPT): bot đã tự làm các mốc 7, 27, 180 ngày

Nhắc thầy cho **mọi khách nhận máy** nhắn "nhận máy <tên máy>". Đây là cách tăng danh sách khách nhận khuyến mãi tốt nhất. Bảng dưới là các mốc và nội dung đang dùng. Muốn đổi nội dung thì sửa mảng `FOLLOWUPS`.

| Thời điểm | Nội dung gợi ý |
|---|---|
| Ngay sau khi giao máy | Cảm ơn, nhắc thời hạn bảo hành 6–12 tháng, 1 đổi 1 trong 30 ngày đầu |
| Sau 7 ngày | Hỏi máy dùng ổn không, nhờ đánh giá Google Maps (gắn với mẫu 7 check-in) |
| Ngày 25–28 | Nhắc sắp hết hạn 1 đổi 1, mời ghé kiểm tra miễn phí |
| 6 tháng | Mời vệ sinh máy miễn phí, kiểm tra pin |

Ngày 25–28 bot gửi ở ngày 27. Mốc "ngay sau khi giao máy" là phiếu bảo hành điện tử.

## Sửa hoặc thêm mẫu khuyến mãi

1. Sửa mảng `PROMO_PRESETS` trong `zalo-bot/worker.template.js`. Mỗi mẫu gồm `['Tên ngắn', '<emoji> TIÊU ĐỀ\nNội dung 1 câu.']`.
2. Cập nhật bảng mẫu khuyến mãi trong `zalo-bot/HUONG-DAN.md`, và danh sách mẫu trong file skill này.
3. Chạy `powershell -ExecutionPolicy Bypass -File zalo-bot\build.ps1`, rồi commit và push lên `master`. Cloudflare tự deploy trong khoảng 1 phút.
4. Báo thầy nhắn `/kmmau` để xem mẫu mới.
