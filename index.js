import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 🔹 absolute uploads folder
const uploadDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 🔹 multer config
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// 🔹 serve uploads as static files
app.use("/uploads", express.static(uploadDir));

// 🔹 normalize windows path
function normalizeWindowsPath(pathStr) {
  return pathStr.replace(/\\\\/g, "\\");
}

/* ===========================
   📤 UPLOAD ROUTE
=========================== */
app.post("/upload", upload.single("video"), (req, res) => {
  console.log('k');
  
  if (!req.file) {
    return res.status(400).json({ message: "No video uploaded" });
  }

  console.log("REQ FILE:", req.file);

  const congempath = normalizeWindowsPath(req.file.path);

  res.json({
    success: true,
    congempath, // 🔑 frontend will send this to /analyze
  });
});

/* ===========================
   🤖 ANALYZE ROUTE (Gemini)
=========================== */
// app.post("/analyze", async (req, res) => {
//   try {
//     const { path: videoPath } = req.body; // ✅ renamed
//     console.log("REQUEST BODY:", req.body);

//     if (!videoPath) {
//       return res.status(400).json({ message: "No video path provided" });
//     }

//     const absolutePath = path.resolve(videoPath); // ✅ works now

//     if (!fs.existsSync(absolutePath)) {
//       return res.status(404).json({ message: "Video file not found" });
//     }

//     console.log("Analyzing video at:", absolutePath);

//     const file = await ai.files.upload({
//       file: absolutePath,
//       config: {
//         mimeType: "video/mp4",
//       },
//     });

//     let activeFile = await ai.files.get(file.name);
//     while (activeFile.state === "PROCESSING") {
//       await new Promise((r) => setTimeout(r, 2000));
//       activeFile = await ai.files.get(file.name);
//     }

//     if (activeFile.state === "FAILED") {
//       throw new Error("Gemini video processing failed");
//     }

//     const result = await ai.models.generateContent({
//       model: "gemini-2.5-flash",
//       contents: [
//         {
//           role: "user",
//           parts: [
//             {
//               fileData: {
//                 fileUri: activeFile.uri,
//                 mimeType: activeFile.mimeType,
//               },
//             },
//             {
//               text:
//                 "You are a boxing coach. Analyze the video and give beginner-friendly feedback on stance, punches, footwork, and defense.",
//             },
//           ],
//         },
//       ],
//     });

//     res.json({
//       success: true,
//       feedback: result.text,
//     });
//   } catch (err) {
//     console.error("ANALYZE ERROR:", err);
//     res.status(500).json({ message: "Analysis failed" });
//   }
// });

app.post("/analyze", async (req, res) => {
  try {
    const { path: uploadedPath, perspective  } = req.body;

    if (!uploadedPath) {
      return res.status(400).json({ message: "No video path provided" });
    }
    if (!perspective) {
  return res.status(400).json({ message: "No perspective provided" });


}

   // 3️⃣ Perspective instruction (KEY PART)
    let perspectiveInstruction = "";

    if (perspective === "left") {
      perspectiveInstruction =
        "The user is the boxer on the LEFT side of the video. Focus ONLY on the left-side boxer.";
    } else if (perspective === "right") {
      perspectiveInstruction =
        "The user is the boxer on the RIGHT side of the video. Focus ONLY on the right-side boxer.";
    } else if (perspective === "alone") {
      perspectiveInstruction =
        "The user is the ONLY boxer in the video. Analyze their solo performance.";
    }

    // 1️⃣ Copy uploaded file → myVideo/vid.mp4
    const targetDir = path.join(process.cwd(), "myVideo");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir);
    }

    const targetPath = path.join(targetDir, "vid.mp4");
    fs.copyFileSync(uploadedPath, targetPath);

    console.log("Copied video to:", targetPath);

    // 2️⃣ EXACT SAME CODE THAT WORKED
    let file = await ai.files.upload({
      file: targetPath,
      config: { mimeType: "video/mp4" },
    });

    console.log("Uploaded. Processing video...");

    while (file.state !== "ACTIVE") {
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: file.name });
      console.log("Video state:", file.state);
    }

    console.log("Video ready. Running analysis...");

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: file.uri,
                mimeType: "video/mp4",
              },
            },
            {
              text: `
You are a professional boxing coach.

${perspectiveInstruction}

Analyze the user's performance and provide:
1. Punching mistakes
2. Footwork issues
3. Defensive problems
4. 3 clear improvement tips

Be concise, practical, and beginner-friendly.
              `,
            },
          ],
        },
      ],
    });

    res.json({
      success: true,
      feedback: result.text,
    });
  } catch (err) {
    console.error("ANALYZE ERROR:", err);
    res.status(500).json({ message: "Analysis failed" });
  }
});


/* ===========================
   🚀 START SERVER
=========================== */
app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});
