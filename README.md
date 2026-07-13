# LINE Bot ตอบคำถามด้วย AI (Gemini — ฟรี)

บอทนี้รับข้อความจาก LINE แล้วส่งไปถาม Google Gemini AI แล้วตอบกลับให้ผู้ใช้อัตโนมัติ ใช้ฟรีเทียร์ของ Google ไม่ต้องผูกบัตรเครดิต

---

## ขั้นตอนที่ 1: สมัคร Gemini API Key (ฟรี ไม่ต้องผูกบัตร)

1. ไปที่ https://aistudio.google.com/apikey (ล็อกอินด้วยบัญชี Google)
2. กด **Create API key** → เลือกหรือสร้างโปรเจกต์ใหม่
3. คัดลอกคีย์ที่ได้ (เก็บไว้ในโน้ตชั่วคราว)

> หมายเหตุ: ฟรีเทียร์นี้ใช้ได้ต่อเนื่องไม่มีวันหมดอายุ แต่มีจำกัดจำนวนคำขอต่อวัน/ต่อนาที (เพียงพอสำหรับบอทส่วนตัว) และ Google อาจนำข้อความที่ส่งเข้ามาไปใช้พัฒนาโมเดล จึงไม่ควรส่งข้อมูลลับผ่านบอทนี้

---

## ขั้นตอนที่ 2: ตั้งค่า LINE Messaging API (มีช่องทางอยู่แล้ว)

เนื่องจากมี Official Account อยู่แล้ว เข้าไปที่ https://developers.line.biz/console/ แล้วเลือก Provider/Channel ของคุณ ไปที่แท็บ **Messaging API** แล้วเก็บค่า 2 ตัวนี้ไว้:

- **Channel secret** (อยู่ในแท็บ Basic settings)
- **Channel access token** (กด Issue ในแท็บ Messaging API ถ้ายังไม่มี)

**สำคัญ:** ที่หน้า Messaging API เดียวกัน ให้ปิด (toggle off) ตัวเลือก **"Auto-reply messages"** และ **"Greeting messages"** ไว้ ไม่งั้นจะชนกับบอทของเรา

---

## ขั้นตอนที่ 3: Deploy ขึ้น Render (ฟรี ง่าย)

1. สร้างบัญชี GitHub ถ้ายังไม่มี แล้วอัปโหลดโฟลเดอร์นี้ทั้งหมดขึ้นเป็น repository ใหม่
2. ไปที่ https://render.com สมัคร/ล็อกอิน (ล็อกอินด้วย GitHub ได้เลย)
3. กด **New +** > **Web Service** > เลือก repository ที่เพิ่งอัปโหลด
4. ตั้งค่า:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. ไปที่แท็บ **Environment** ใส่ตัวแปรทั้ง 3 ตัว (ใช้ค่าจริง ไม่ใช่ค่าตัวอย่าง):
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `GEMINI_API_KEY`
6. กด **Create Web Service** รอ deploy เสร็จ จะได้ URL ประมาณ `https://your-app-name.onrender.com`

> หมายเหตุ: แผนฟรีของ Render จะ "หลับ" เมื่อไม่มีคนใช้งานสักพัก และตื่นช้าประมาณ 30-50 วินาทีตอนมีข้อความเข้าครั้งแรก ถ้าต้องการให้ตอบเร็วตลอดเวลาต้องใช้แผนเสียเงิน

---

## ขั้นตอนที่ 4: เชื่อม Webhook เข้ากับ LINE

1. กลับไปที่ LINE Developers Console > แท็บ **Messaging API**
2. ช่อง **Webhook URL** ใส่: `https://your-app-name.onrender.com/webhook`
3. กด **Verify** ให้ขึ้นสถานะสำเร็จ (ต้อง deploy เสร็จก่อนถึงจะ verify ผ่าน)
4. เปิด toggle **Use webhook** ให้เป็นสีเขียว (เปิดใช้งาน)

---

## ขั้นตอนที่ 5: ทดสอบ

เพิ่มเพื่อน LINE Official Account ของคุณ แล้วลองพิมพ์คำถามอะไรก็ได้ บอทจะตอบกลับด้วย AI

---

## รันทดสอบในเครื่องตัวเอง (ถ้าต้องการ)

```bash
npm install
cp .env.example .env
# แก้ไข .env ใส่ค่าจริง
npm start
```

จากนั้นต้องใช้เครื่องมืออย่าง `ngrok` เพื่อเปิด URL ชั่วคราวออกสู่อินเทอร์เน็ต (เพราะ LINE ต้องยิง webhook มาที่ URL ที่เข้าถึงได้จริง ไม่ใช่ localhost):

```bash
ngrok http 3000
```

แล้วเอา URL จาก ngrok (เช่น `https://xxxx.ngrok-free.app/webhook`) ไปใส่ในช่อง Webhook URL ของ LINE

---

## ปรับแต่งเพิ่มเติม

- เปลี่ยนบุคลิก/สไตล์การตอบ: แก้ข้อความใน `systemInstruction` ที่ไฟล์ `server.js`
- เปลี่ยนรุ่น AI: แก้ค่า `model` ในไฟล์ `server.js` (เช่น `gemini-2.5-flash-lite` ถ้าอยากได้โควตาต่อนาทีเยอะขึ้น)
- ตอนนี้ประวัติแชทเก็บไว้ในหน่วยความจำเท่านั้น (หายเมื่อรีสตาร์ทเซิร์ฟเวอร์) — ถ้าต้องการเก็บถาวรต้องต่อฐานข้อมูล เช่น Redis หรือ PostgreSQL เพิ่มเติม
- ถ้าโควตาฟรีต่อวันไม่พอ ให้ลองเปลี่ยนไปใช้ `gemini-2.5-flash-lite` ซึ่งได้โควตาต่อวันเยอะกว่า
