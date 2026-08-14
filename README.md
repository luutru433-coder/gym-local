# Gym Local

Gym Local là ứng dụng PWA theo dõi tập luyện và dinh dưỡng dành cho một người dùng. App không cần tài khoản, không có máy chủ riêng, không thu phí và lưu dữ liệu cá nhân ngay trên thiết bị.

- Dùng app: https://luutru433-coder.github.io/gym-local/
- Mã nguồn: https://github.com/luutru433-coder/gym-local
- Gói dinh dưỡng: https://github.com/luutru433-coder/gym-local/releases/tag/nutrition-v2026.08

## Điểm chính

- 50 nhóm động tác với 199 biến thể thiết bị đã review: máy, cable, tạ đơn, tạ đòn, Smith, dây kháng lực và bodyweight.
- Mỗi biến thể đã review có đúng một video hướng dẫn trực tiếp. Video chỉ được tải sau khi người dùng bấm phát, dùng YouTube privacy-enhanced embed và luôn có hướng dẫn chữ dự phòng.
- Lịch Full Body, Upper/Lower, Strength và Push/Pull/Legs; hỗ trợ tự tạo lịch, ghi set/tạ/reps/RIR, autosave, rest timer và đổi thiết bị giữa buổi mà không trộn lịch sử.
- Gói dinh dưỡng SQLite tùy chọn gồm 13.835 thực phẩm, 24.907 bí danh tiếng Việt và 300 món Việt ước tính từ nguyên liệu USDA.
- Tìm thực phẩm offline theo tên tiếng Việt/không dấu; hiển thị kcal, macro và các vitamin/khoáng chất có dữ liệu. Giá trị bị thiếu không bị tự gán bằng 0.
- Thực phẩm tự tạo, tra cứu Open Food Facts và quét mã vạch chỉ xin quyền camera sau thao tác rõ ràng của người dùng.
- Tiến độ e1RM, volume, số set theo nhóm cơ, số đo cơ thể, backup ZIP có checksum và xuất CSV.
- PWA dùng được offline sau lần tải đầu; bản cập nhật chờ nếu đang có buổi tập.
- Song ngữ Việt/Anh.

## Chạy trên máy

Yêu cầu Node.js 22.13+ và pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Mở URL Vite hiển thị trong terminal. Dữ liệu của localhost và bản GitHub Pages là hai kho trình duyệt riêng; dùng Backup/Restore để chuyển dữ liệu.

Gói dinh dưỡng lớn không nằm trong Git. Bản phát hành chính thức được lưu ở GitHub Release và workflow Pages kiểm tra SHA-256 trước khi đưa tệp vào site. Khi self-host thủ công, đặt `gym-local-nutrition-2026.08.sqlite3` cạnh `nutrition-pack-manifest.json` trong thư mục public/deploy.

## Kiểm tra

```bash
pnpm run verify
pnpm nutrition:verify-pack
```

`pnpm run verify` chạy lint, typecheck, kiểm tra nội dung, test và production build. Lệnh kiểm tra gói xác nhận SHA-256, SQLite integrity, số lượng bản ghi và tìm kiếm FTS5.

## Tự triển khai miễn phí lên GitHub Pages

1. Tạo GitHub Release tag `nutrition-v2026.08` và upload tệp SQLite từ `outputs/`.
2. Push mã nguồn lên nhánh `main`.
3. Bật Pages với source **GitHub Actions**.
4. Workflow `.github/workflows/deploy-pages.yml` chỉ deploy sau khi toàn bộ kiểm tra và checksum gói đạt.

App dùng `HashRouter` và asset path tương đối nên hoạt động ở repository subpath. Trên iPhone, mở URL Pages bằng Safari rồi chọn **Share → Add to Home Screen**.

## Cấu trúc dễ cập nhật bằng Codex

```text
apps/web/             composition root, giao diện và feature screens
packages/contracts/  hợp đồng dữ liệu và version dùng chung
packages/catalog/    movement, equipment variants, video manifest, nguồn
packages/workouts/   routine và logic buổi tập
packages/nutrition/  nutrient snapshot, provider, SQLite worker, Open Food Facts
packages/progress/   PR, e1RM và thống kê
packages/storage/    IndexedDB, migration và trạng thái gói
packages/backup/     ZIP/CSV, checksum và tương thích phiên bản
packages/media/      allowlist và chính sách URL/embed
packages/ui/         component trình bày dùng chung
content/             dữ liệu được review và manifest sinh tự động
scripts/             audit, generator và pack verification
docs/                ADR, kiến trúc, playbook và release checklist
```

Đọc `AGENTS.md` và `docs/codex-change-template.md` trước khi giao thay đổi cho Codex. Ma trận module/kiểm thử nằm trong `docs/codex-update-playbook.md`; thay đổi schema phải có ADR, migration test và backup round-trip test.

## Riêng tư và giới hạn

- Không có cloud sync. Xóa site data có thể xóa nhật ký; hãy backup định kỳ. Gói dinh dưỡng có thể tải lại và không nằm trong backup cá nhân.
- App chỉ gọi Internet khi tải media, cài gói, tra Open Food Facts hoặc kiểm tra bản cập nhật. Video YouTube không được tải xuống hay cache.
- Dữ liệu món Việt là ước tính từ nguyên liệu; dữ liệu cộng đồng có thể thiếu hoặc sai. Luôn kiểm tra nhãn thực phẩm nếu cần độ chính xác cao.
- Nội dung tập luyện chỉ để tham khảo, không thay thế tư vấn y tế hoặc huấn luyện cá nhân.

Xem `THIRD_PARTY_NOTICES.md` để biết nguồn và điều khoản của nội dung bên thứ ba.
