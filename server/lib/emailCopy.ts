import type { PublicLanguage } from "../../shared/publicLanguage.js";

const INDONESIAN_EMAIL = {
  "Queues & Reservations For Hospitality": "Antrean & Reservasi untuk Industri Hospitality",
  "If the button doesn't work, paste this link into your browser:":
    "Jika tombol tidak berfungsi, salin tautan ini ke browser Anda:",
  "Reset Your SeatPing Password": "Atur Ulang Kata Sandi SeatPing Anda",
  "Reset Your Password": "Atur Ulang Kata Sandi Anda",
  "We got a request to reset the password on your SeatPing account. Click below to choose a new one.":
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun SeatPing Anda. Klik tombol di bawah untuk membuat kata sandi baru.",
  "Reset Password": "Atur Ulang Kata Sandi",
  "This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email. Your password won't change.":
    "Tautan ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini. Kata sandi Anda tidak akan berubah.",
  "Hi {name}, ": "Halo {name}, ",
  "your SeatPing password was just updated. You can now sign in with your new password.":
    "kata sandi SeatPing Anda baru saja diperbarui. Sekarang Anda dapat masuk menggunakan kata sandi baru.",
  "<strong>Didn't make this change?</strong> Contact support right away so we can help secure your account.":
    "<strong>Tidak merasa melakukan perubahan ini?</strong> Segera hubungi tim dukungan agar kami dapat membantu mengamankan akun Anda.",
  "<strong>Didn't make this change?</strong> Reach out to us right away at {supportLink} and we'll help secure your account.":
    "<strong>Tidak merasa melakukan perubahan ini?</strong> Segera hubungi kami melalui {supportLink} agar kami dapat membantu mengamankan akun Anda.",
  "Your Password Was Changed": "Kata Sandi Anda Telah Diubah",
  "Your SeatPing Password Was Just Updated": "Kata Sandi SeatPing Anda Baru Saja Diperbarui",
  "Your SeatPing Password Was Changed": "Kata Sandi SeatPing Anda Telah Diubah",
  "Welcome To SeatPing": "Selamat Datang di SeatPing",
  "Welcome to SeatPing, {name}": "Selamat Datang di SeatPing, {name}",
  "Join Queues, Book Tables, And Get Live Updates":
    "Ikuti Antrean, Pesan Meja, dan Dapatkan Informasi Terbaru",
  "Your account is ready. SeatPing keeps you out of the waiting-room shuffle. Here's what you can do with it:":
    "Akun Anda sudah siap digunakan. Dengan SeatPing, Anda tidak perlu lagi menunggu berdesakan. Berikut yang bisa Anda lakukan:",
  "Join a restaurant's waitlist from your phone and track your spot in line":
    "Bergabung dengan antrean restoran melalui ponsel dan memantau posisi antrean.",
  "Book and manage reservations without creating an account each time":
    "Membuat serta mengelola reservasi tanpa harus membuat akun setiap kali memesan.",
  "Get notified the moment your table is ready": "Mendapat pemberitahuan saat meja Anda siap.",
  "Keep your upcoming and past bookings in one place":
    "Melihat reservasi mendatang dan riwayat reservasi dalam satu tempat.",
  "View Your Profile": "Lihat Profil Anda",
  'Or head to the <a href="{homeUrl}" style="color: {accent};">SeatPing homepage</a> to find a place to eat.':
    'Atau kunjungi <a href="{homeUrl}" style="color: {accent};">halaman utama SeatPing</a> untuk menemukan restoran pilihan Anda.',
  " Your {trialDays}-day trial is active.":
    " Masa uji coba Anda selama {trialDays} hari telah aktif.",
  "Welcome to SeatPing, {name}.{trialSentence} Follow these steps to start accepting queues and reservations.":
    "Selamat datang di SeatPing, {name}.{trialSentence} Ikuti langkah-langkah berikut untuk mulai menerima antrean dan reservasi.",
  "Set Up Your First Location": "Siapkan Lokasi Pertama Anda",
  "Get Your First Location Live In Six Steps": "Aktifkan Lokasi Pertama Anda dalam Enam Langkah",
  "Add or review your business profile": "Tambahkan atau periksa profil bisnis Anda.",
  "Add your first location's details": "Tambahkan informasi lokasi pertama Anda.",
  "Set your opening hours": "Atur jam operasional.",
  "Configure your reservation settings": "Konfigurasikan pengaturan reservasi.",
  "Download and share your location's QR code": "Unduh dan bagikan kode QR lokasi Anda.",
  "Run a test booking to see the customer flow end to end":
    "Lakukan uji coba reservasi untuk melihat proses pelanggan dari awal hingga akhir.",
  "Open Your Dashboard": "Buka Dashboard Anda",
  "Anything unclear or not working the way you'd expect? Just reply to this email. It comes straight to us.":
    "Ada hal yang kurang jelas atau tidak berjalan sesuai harapan? Cukup balas email ini. Pesan Anda akan langsung sampai kepada tim kami.",
  "You're In The Queue": "Anda Sudah Masuk Antrean",
  "You're in the Queue": "Anda Sudah Masuk Antrean",
  "You're #{position} In Line At {businessName}": "Posisi Anda Nomor {position} di {businessName}",
  "Hi {firstName}, you're on the waitlist at <strong>{businessName}</strong>. We'll let you know when your table is ready.":
    "Halo {firstName}, Anda sudah masuk daftar antrean di <strong>{businessName}</strong>. Kami akan memberi tahu saat meja Anda siap.",
  "You're #{position} in line": "Posisi antrean Anda: #{position}",
  "Queue details": "Detail Antrean",
  "You can close this email. We'll notify you when it's your turn. Thanks for your patience!":
    "Anda boleh menutup email ini. Kami akan mengirimkan pemberitahuan saat giliran Anda tiba. Terima kasih telah menunggu!",
  Restaurant: "Restoran",
  Location: "Lokasi",
  Name: "Nama",
  "Your Spot": "Posisi Antrean",
  "Your Table Is Ready": "Meja Anda Sudah Siap",
  "Your Table Is Ready At {businessName}": "Meja Anda Sudah Siap di {businessName}",
  "Your table is ready at {businessName}": "Meja Anda di {businessName} sudah siap.",
  "Please head to the host within the next <strong>5 minutes</strong> to be seated. Thanks for waiting with SeatPing!":
    "Silakan menuju petugas penerima tamu dalam waktu <strong>5 menit</strong> untuk diarahkan ke meja Anda. Terima kasih telah menunggu bersama SeatPing!",
  "Reservation Confirmed": "Reservasi Dikonfirmasi",
  "Reservation Confirmed: {businessName}": "Reservasi Dikonfirmasi: {businessName}",
  "Reservation Confirmed For {businessName}, {dateLabel} At {timeLabel}":
    "Reservasi di {businessName} untuk {dateLabel} pukul {timeLabel} telah dikonfirmasi",
  "Hi {firstName},": "Halo {firstName},",
  "You're booked. We look forward to seeing you!":
    "Reservasi Anda berhasil! Kami menantikan kedatangan Anda.",
  Reservation: "Detail Reservasi",
  Date: "Tanggal",
  Time: "Waktu",
  "Number of Guests": "Jumlah Tamu",
  Guest: "Tamu",
  Guests: "Tamu",
  "{partySize} Guests": "{partySize} orang",
  "{partySize} Guest": "{partySize} orang",
  "Manage Reservation": "Kelola Reservasi",
  "Need to change your time, number of guests, or cancel? Use the button above. No login required.":
    "Ingin mengubah waktu, jumlah tamu, atau membatalkan reservasi? Gunakan tombol di atas. Tidak perlu login.",
  "Cancellation Policy:": "Kebijakan Pembatalan:",
  "Your Reservation Is Coming Up": "Waktu Reservasi Anda Sebentar Lagi",
  "Your Reservation At {businessName} Is In About 2 Hours":
    "Reservasi Anda di {businessName} Sekitar 2 Jam Lagi",
  "Hi {firstName}, a quick reminder that your table at <strong>{businessName}</strong> is coming up in about 2 hours.":
    "Halo {firstName}, kami ingin mengingatkan bahwa reservasi meja Anda di <strong>{businessName}</strong> akan dimulai sekitar 2 jam lagi.",
  "New Reservation At {locationName}": "Reservasi Baru di {locationName}",
  "{customerName} · Party Of {partySize} · {dateLabel} At {timeLabel}":
    "{customerName} · {partySize} Tamu · {dateLabel} pukul {timeLabel}",
  "{customerName} · Party Of {partySize} · {dateLabel} at {timeLabel}":
    "{customerName} · {partySize} Tamu · {dateLabel} pukul {timeLabel}",
  "New Reservation": "Reservasi Baru",
  "A new reservation was just booked at <strong>{locationName}</strong>.":
    "Reservasi baru telah dibuat di <strong>{locationName}</strong>.",
  Email: "Email",
  Phone: "Telepon",
  Status: "Status",
  Confirmed: "Dikonfirmasi",
  "Guest Notes:": "Catatan Tamu:",
  "View In Dashboard": "Lihat di Dashboard",
  "Reservation Needs A Table At {locationName}": "Reservasi Memerlukan Meja di {locationName}",
  "Reservation Needs A Table": "Reservasi Memerlukan Meja",
  "A reservation at <strong>{locationName}</strong> was confirmed, but no table could be assigned automatically.":
    "Reservasi di <strong>{locationName}</strong> telah dikonfirmasi, tetapi sistem belum dapat menetapkan meja secara otomatis.",
  "Why:": "Alasan:",
  "No table was free for the whole reservation window.":
    "Tidak ada meja yang tersedia selama seluruh durasi reservasi.",
  "Smart Assignment could not find a table for this reservation.":
    "Smart Assignment tidak dapat menemukan meja untuk reservasi ini.",
  "Reservation ID": "ID Reservasi",
  "Needs Review": "Perlu Ditinjau",
  "The booking is held for the guest. Assign a table when one frees up, or join tables on the floor plan.":
    "Reservasi tamu tetap tersimpan. Tetapkan meja ketika ada yang kosong atau gabungkan meja melalui denah lantai.",
  "Review Reservation": "Tinjau Reservasi",
  "Open Floor Management": "Buka Manajemen Lantai",
  "Feedback [{type}]: {subject}": "Masukan [{type}]: {subject}",
  "New Feedback From {name}": "Masukan Baru dari {name}",
  "New Feedback": "Masukan Baru",
  Feedback: "Detail Masukan",
  Type: "Jenis",
  Severity: "Tingkat Keparahan",
  Business: "Bisnis",
  Message: "Pesan",
  "Bug / Something Broken": "Bug / Fitur Tidak Berfungsi",
  "UX / Usability Issue": "Masalah Pengalaman Pengguna / Kemudahan Penggunaan",
  "Feature Request": "Permintaan Fitur",
  "Pricing / Billing": "Harga / Tagihan",
  Other: "Lainnya",
  Low: "Rendah",
  Medium: "Sedang",
  High: "Tinggi",
  "Feedback Received: {ticketNumber}": "Masukan Diterima: {ticketNumber}",
  "We've Logged Your Feedback: {ticketNumber}": "Masukan Anda Telah Dicatat: {ticketNumber}",
  "Thanks For The Feedback": "Terima Kasih atas Masukan Anda",
  "Hi {userName}, we've logged your feedback and we'll review it shortly.":
    "Halo {userName}, masukan Anda telah kami catat dan akan segera kami tinjau.",
  "Your ticket": "Tiket Anda",
  "Ticket ID": "ID Tiket",
  Subject: "Subjek",
  Open: "Terbuka",
  "Hold onto your ticket ID (<strong>{ticketNumber}</strong>) if you need to follow up.":
    "Simpan ID tiket Anda (<strong>{ticketNumber}</strong>) jika ingin menindaklanjuti laporan ini.",
  " You can also reach us anytime at {supportLink}.":
    " Anda juga dapat menghubungi kami kapan saja melalui {supportLink}.",
  "Re: {subject} [Ticket #{ticketNumber}]": "Re: {subject} [Tiket #{ticketNumber}]",
  "Response To Your Feedback": "Tanggapan atas Masukan Anda",
  "Your SeatPing Ticket Has A Reply": "Tiket Dukungan SeatPing Anda Telah Dibalas",
  "Hi {senderName},": "Halo {senderName},",
  "Best regards,": "Salam,",
  "The SeatPing Team": "Tim SeatPing",
  "Reply directly to this email to continue the conversation.":
    "Balas langsung email ini untuk melanjutkan percakapan.",
  "A message": "Pesan",
  "A message from {businessName}": "Pesan dari {businessName}",
  "You are receiving this because you visited {businessName}. Sent by SeatPing on behalf of {businessName}.":
    "Anda menerima email ini karena pernah berkunjung ke {businessName}. Dikirim oleh SeatPing atas nama {businessName}.",
  "Sent by SeatPing on behalf of {businessName}": "Dikirim oleh SeatPing atas nama {businessName}",
  "SeatPing Email Test": "Pengujian Email SeatPing",
  "Test Email from SeatPing": "Email Uji Coba dari SeatPing",
  "This is a test email to verify SMTP configuration.":
    "Ini adalah email uji coba untuk memverifikasi konfigurasi SMTP.",
  "Time:": "Waktu:",
  "SeatPing email delivery test": "Uji pengiriman email SeatPing",
  "SeatPing delivery test": "Uji pengiriman SeatPing",
  "Email Delivery Test": "Uji Pengiriman Email",
  "This is a SeatPing email delivery test. If you received it, delivery is working for this address.":
    "Ini adalah email uji pengiriman SeatPing. Jika Anda menerimanya, berarti pengiriman email ke alamat ini berfungsi.",
  "SeatPing Demo | {name}": "Demo SeatPing | {name}",
  "Name: {name}\nRestaurant Or Company: {company}\nNotes: {notes}\nGuest Timezone: {timezone}":
    "Nama: {name}\nRestoran atau Perusahaan: {company}\nCatatan: {notes}\nZona Waktu Tamu: {timezone}",
  "Not Provided": "Belum Diisi",
  None: "Tidak Ada",
} as const;

export type EmailText = keyof typeof INDONESIAN_EMAIL;

export function emailCopy(language: PublicLanguage = "en") {
  return (key: EmailText, values: Record<string, string | number> = {}): string => {
    let text: string = key;
    if (language === "id") {
      text = INDONESIAN_EMAIL[key];
    }
    return text.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
      const value = values[name];
      if (value === undefined) {
        return placeholder;
      }
      return String(value);
    });
  };
}
