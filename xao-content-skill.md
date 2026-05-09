# /xao-content — Tự động xào nấu content từ video YouTube đang mở

Khi user gọi lệnh này, thực hiện **tự động toàn bộ pipeline** theo thứ tự dưới đây. Không hỏi thêm bước nào trừ khi cần thiết.

---

## BƯỚC 1: LẤY TRANSCRIPT TỪ CHROME

1. Gọi `tabs_context_mcp` để lấy danh sách tab hiện có.
2. Xác định tab đang mở YouTube video (URL dạng `youtube.com/watch?v=`).
3. Dùng `javascript_tool` trên tab đó để extract caption URL:

```javascript
// Tìm captionTracks trong page data của YouTube
let captionUrl = null;
const scripts = document.querySelectorAll('script');
for (const s of scripts) {
  const m = s.textContent.match(/"captionTracks":\[.*?"baseUrl":"([^"]+)"/);
  if (m) {
    captionUrl = m[1].replace(/\\u0026/g, '&').replace(/\\u003d/g, '=');
    break;
  }
}
// Cũng lấy tiêu đề
const title = document.title.replace(' - YouTube', '');
JSON.stringify({ captionUrl, title });
```

4. Dùng `WebFetch` để tải URL caption (XML) đó về.
5. Parse XML: lấy nội dung tất cả thẻ `<text>` → ghép thành transcript thuần văn bản (bỏ timestamp, bỏ thẻ HTML).
6. Nếu không tìm thấy caption tự động (video không có phụ đề), thông báo cho user và dừng.

**Hiển thị xác nhận:**
```
📺 Video: [Tiêu đề]
📝 Transcript: [200 từ đầu]...

→ Đang tiến hành xào nấu...
```

---

## BƯỚC 2: GIAI ĐOẠN 1 — GIẢI PHẪU KỊCH BẢN GỐC

Áp dụng **Prompt 1.1 – "Giải phẫu" 3 Lớp**:

> **[Vai trò]**: Bạn là một "Người Dẫn Dắt Tâm Linh Việt" — kết hợp Người Kể Chuyện Phật Pháp Thấu Cảm (am hiểu ứng dụng lời Phật dạy vào đời sống: lo âu, sức khỏe, tài lộc, gia đạo) và Người Hướng Dẫn Thực Hành Tận Tâm (diễn giải giáo lý phức tạp thành bước thực hành đơn giản cho đại chúng Việt Nam).
>
> **Nhiệm vụ**: Phân tích transcript trên và "giải cấu trúc" thành 2 phần:
>
> **A. "Công thức An Lạc" (GIỮ LẠI)**:
> - Cấu trúc dẫn dắt (Vấn đề → Câu chuyện đồng cảm → Lời Phật dạy → Giải pháp thực hành → Hồi hướng)
> - Mô-típ tâm lý (đồng cảm nỗi khổ, gieo hy vọng, niềm tin tâm linh)
> - Vòng cung cảm xúc (bất an/lo âu → hiểu biết/niềm tin → bình an/hành động)
> - Bài học ứng dụng Phật pháp
>
> **B. "Vỏ bọc Chi tiết" (THAY ĐỔI HOÀN TOÀN)**:
> - Tên nhân vật cụ thể, bối cảnh quá đặc trưng, nghề nghiệp không liên quan
> - Các sự kiện và lời thoại không phổ quát
> - Đặc biệt: chuyển xung đột thành vấn đề đời sống (bệnh tật, khó khăn tài chính, mâu thuẫn gia đình)
>
> **Phân tích 3 khía cạnh**:
> 1. Luận giải Phật Pháp & Tính Thực Tiễn (nông hay sâu?)
> 2. Móc câu Đồng Cảm & Hy Vọng (móc câu nào được dùng?)
> 3. Văn hóa Tâm Linh & Giá Trị Việt (có thể lồng ghép gì?)

Sau đó áp dụng **Prompt 1.2 – Xác định "Linh hồn & Con Đường"**:
> Đề xuất 2 "Mục tiêu Nâng cấp" cốt lõi:
> 1. **Linh hồn Bài Pháp Thoại**: Thông điệp Phật pháp cốt lõi cần làm sâu sắc hơn (đề xuất 1-2 điểm đào sâu cụ thể)
> 2. **Con Đường Dẫn Dắt**: Chiến thuật thu hút & giữ chân khán giả liền mạch hơn (đề xuất 1-2 chiến thuật)

---

## BƯỚC 3: GIAI ĐOẠN 2 — DÀN Ý CHI TIẾT

Áp dụng **Prompt 2.1 – Dàn ý Chi tiết**:

Xây dựng dàn ý **8-10 phần** theo Kiến trúc Kịch bản Dẫn dắt Tâm linh Việt. Bắt đầu bằng **PHẦN 0: CÁI MÓC (THE HOOK)**. Kết thúc bằng **PHẦN KẾT: KẾT LUẬN & KÊU GỌI HÀNH ĐỘNG**.

Với mỗi phần, ghi rõ:
- **Tên Phần**: Ví dụ "Nỗi Niềm Mất Ngủ Triền Miên và Lời Phật Dạy Nhiệm Màu"
- **Diễn biến chính**: Tóm tắt ngắn gọn
- **Mục tiêu Phần**
- **Ghi chú Kiến trúc "Chạm"**: Đánh dấu vị trí các yếu tố: `[ĐẶT VẤN ĐỀ]` `[CÂU CHUYỆN MINH HỌA]` `[TRÍCH DẪN KINH ĐIỂN]` `[LUẬN GIẢI PHẬT PHÁP]` `[HƯỚNG DẪN THỰC HÀNH]` `[LỜI KHÍCH LỆ]` `[HỒI HƯỚNG CÔNG ĐỨC]` `[ĐIỂM CHẠM VĂN HÓA]` `[TEASER NỘI BỘ]`

---

## BƯỚC 4: GIAI ĐOẠN 3 — VIẾT KỊCH BẢN HOÀN CHỈNH

### Phần 0 — The Hook (~250 từ)

> **QUY TẮC MỞ ĐẦU**: Bắt đầu bằng lời chào ấm áp ("Nam mô A Di Đà Phật, kính chào quý cô bác..."), sau đó đặt câu hỏi tu từ hoặc mô tả nỗi niềm phổ biến, tạo đồng cảm ngay lập tức. Hé lộ giải pháp tâm linh → tạo tò mò và hy vọng. Kết bằng câu chuyển dẫn vào nội dung chính.
>
> **QUY TẮC VÀNG**: TUYỆT ĐỐI KHÔNG dùng "Ở phần trước...". Chỉ xuất văn bản kịch bản thuần túy tiếng Việt, không có ghi chú sản xuất.

### Các Phần Thân bài & Kết (~1000-1200 từ/phần)

Lần lượt viết từng phần theo dàn ý, áp dụng:

> **KỸ THUẬT VIẾT NÂNG CAO**:
> - Mỗi phần bắt đầu bằng câu "đón lấy" và phát triển từ câu cuối phần trước (tính liền mạch)
> - **"Tả, không Kể"** (Show, Don't Tell): Thay vì "bà ấy bình an" → tả "gương mặt bà rạng rỡ, nụ cười nhẹ nhàng nở trên môi"
> - **Chi tiết Gợi nhắc**: tiếng chuông chùa xa vọng, hình ảnh hoa sen...
> - **Chia sẻ Nội tâm**: trăn trở tâm linh, khoảnh khắc giác ngộ nhỏ, cảm giác bình an
> - **Luận giải Phật Pháp sâu sắc hơn đối thủ**: logic, dễ hiểu nhưng có chiều sâu
> - Đối thoại (nếu có) phải tự nhiên, đúng cách giao tiếp người Việt
>
> **LƯU Ý VIỆT HÓA**:
> - Giọng văn: chân thành, nhẹ nhàng, từ tốn, đầy lòng trắc ẩn
> - Tên thuần Việt, đại từ xưng hô phù hợp (cô bác, quý vị, con...)
> - Tham chiếu đời sống Phật giáo VN: ngày Rằm, Mùng Một, lễ Vu Lan, ăn chay...
> - Động lực: bình an, giải khổ, tích phước, báo hiếu, hướng về cõi lành
>
> **PHẦN KẾT**: Tóm tắt bài học cốt lõi + lời động viên/chúc phúc + kêu gọi hành động nhẹ nhàng (chia sẻ pháp, niệm Phật bình luận, đăng ký kênh)

---

## BƯỚC 5: MODULE TỐI ƯU HÓA

### Module A — 5 Tiêu đề YouTube

Tạo 5 tiêu đề tiếng Việt theo công thức:
`[Nguồn Uy Tín/Khung TG Linh Thiêng] + [Con Số Cụ Thể] + [Chủ Đề Cốt Lõi] + [Hứa Hẹn Kết Quả / Cảnh Báo Hậu Quả]`

Quy tắc:
- Bắt đầu bằng "Phật Dạy", "Lời Phật Dạy", "Giờ Thiêng", "Khi Ngủ"...
- Ưu tiên con số: "5 Điều", "7 Câu", "3 Bí Quyết"...
- Mô tả vấn đề phổ biến: bệnh tật, mất ngủ, xui rủi, nghiệp chướng
- Kết bằng lời hứa hẹn ("Ước Nguyện Thành Sự Thật") hoặc cảnh báo nhẹ ("Kẻo Họa Vào Nhà")

### Module B — 3 Ý tưởng Thumbnail

Với mỗi ý tưởng, cung cấp:

**Bước 1A**: Mô tả hình ảnh (Biểu tượng tâm linh / Chân dung người Việt / Hình ảnh minh họa) — màu vàng/cam ấm hoặc trắng/xanh thanh tịnh, ánh sáng dịu, hậu cảnh mờ ảo

**Bước 1B**: Prompt AI vẽ ảnh (tiếng Anh, theo công thức):
`[Style], [Subject & Composition], [Emotion & Expression], [Lighting], [Background & Depth], [Tech specs & Negative prompt]`

Ví dụ base: `"serene photorealistic close-up portrait of golden Amitabha Buddha statue, eyes gently closed in meditation, conveying deep compassion and peace, soft warm golden backlighting creating subtle halo, blurry temple interior background, shallow depth of field, 8K, hyper-detailed --ar 16:9 --no text --style raw"`

**Bước 2**: Text trên thumbnail tiếng Việt — ngắn gọn, màu Vàng/Trắng trên nền tối, font trang trọng

### Module C — Mô tả Video (3 lớp)

Viết description YouTube tiếng Việt:
- **Lớp 1 (Móc)**: 1-2 câu mở đầu với lời chào/niệm Phật + vấn đề/lợi ích chính
- **Lớp 2 (SEO)**: Tóm tắt + lồng ghép từ khóa tự nhiên: niệm Phật, hồi hướng công đức, bình an, hóa giải nghiệp, tụng kinh, tài lộc, tổ tiên...
- **Lớp 3 (CTA)**: Kêu gọi đăng ký, like, bình luận niệm Phật, chia sẻ để gieo duyên lành

### Module D — 15-20 Tags (3 nhóm)

- **Tags Rộng**: Phật pháp, lời Phật dạy, tâm linh, Phật pháp ứng dụng...
- **Tags Cụ thể**: Tên vị Phật/Bồ Tát trong video, vấn đề cụ thể (mất ngủ, giải hạn...), hướng dẫn cụ thể
- **Tags Ngữ cảnh**: Bình an, phước báu, công đức, từ bi, hiếu thảo, sám hối...

Trả về dạng chuỗi ngăn cách bởi dấu phẩy.

---

## OUTPUT CUỐI CÙNG

Trình bày theo thứ tự:
1. ✅ Phân tích (Công thức An Lạc + Vỏ bọc cần thay)
2. 📋 Dàn ý 8-10 phần
3. 🎬 Kịch bản hoàn chỉnh (Hook + tất cả các phần)
4. 📌 5 Tiêu đề
5. 🖼️ 3 Thumbnail (mô tả + AI prompt + text)
6. 📝 Mô tả video
7. 🏷️ Tags
