# Hackathon 7.0: Offline Secure Facial Authentication & Liveness Detection

This document outlines the complete transformation of the existing YOLOv8 people-counting Python project into a robust, offline-first React Native mobile application for secure facial authentication and liveness detection, tailored for remote locations.

---

## 1. Complete Updated Architecture

The architecture shifts from a heavy server/PC-based object detection system to an **Edge-AI Mobile Application**.

*   **Presentation Layer (Frontend):** React Native (UI, Camera interface, Navigation).
*   **Edge AI Layer (On-Device ML):** 
    *   `react-native-vision-camera` with frame processors.
    *   MediaPipe (Face Detection & Liveness/Face Mesh).
    *   TensorFlow Lite (`react-native-fast-tflite`) for MobileFaceNet embeddings.
*   **Offline Data Layer:** SQLite (Face embeddings, User Data, Auth Logs) & MMKV/AsyncStorage (Session states, App configurations).
*   **Cloud Sync Layer (AWS):** Intermittent syncing mechanism pushing queued offline logs to AWS (API Gateway -> Lambda -> DynamoDB & S3).

## 2. Updated Folder Structure

The project will migrate to a standard React Native structure, completely replacing the Python environment.

```text
mobile-facial-auth/
├── src/
│   ├── assets/              # Icons, local images, fonts
│   ├── components/          # Reusable UI (Buttons, CameraOverlay, Alert)
│   ├── navigation/          # React Navigation stacks (Auth, App, Settings)
│   ├── screens/             # Main Screens (Home, Registration, Auth, Sync)
│   ├── services/            # APIs, AWS Sync, Background workers
│   ├── ml/                  # ML Models & Utilities
│   │   ├── models/          # .tflite files (MobileFaceNet, etc.)
│   │   ├── frameProcessors.ts # Vision Camera frame processors
│   │   ├── liveness.ts      # EAR, smile, head tracking algorithms
│   │   └── recognition.ts   # Embedding comparison (Cosine similarity)
│   ├── database/            # SQLite config, entities, repositories
│   ├── store/               # Zustand or Context for state
│   ├── utils/               # Helpers (encryption, image manipulation)
│   └── App.tsx              # Main Entry Point
├── backend-aws-cdk/         # Infrastructure as Code (AWS CDK / Serverless)
│   ├── functions/           # Lambda functions (Sync, Register)
│   └── lib/                 # DynamoDB, S3 bucket definitions
└── package.json
```

## 3. React Native App Structure

The app will use a modular component-based architecture:
*   **CameraView:** Uses `react-native-vision-camera` to capture 60fps frames.
*   **LivenessOverlay:** A UI overlay directing the user ("Blink", "Turn Left").
*   **AuthManager:** Hook handling the orchestration (Detection -> Liveness -> Extraction -> Matching).
*   **NetworkSyncManager:** Headless task handling the AWS sync when internet becomes available (`react-native-netinfo` + `react-native-background-actions`).

## 4. AI Model Recommendations

To meet the `<20MB` and `<1s` inference constraints on mid-range devices:

1.  **Face Detection:** **MediaPipe Face Detection (BlazeFace)** or **Google ML Kit** (built into the OS, ultra-fast, 0MB app size payload).
2.  **Liveness Detection:** **MediaPipe Face Mesh**. Extremely lightweight (around 3MB), provides 468 3D face landmarks to calculate Eye Aspect Ratio (EAR) and Head Pose estimation.
3.  **Face Recognition:** **MobileFaceNet (TFLite, INT8 Quantized)**. 
    *   Size: ~3-5 MB.
    *   Output: 128 or 192-dimensional floating-point array (embedding).

## 5. Backend Flow (AWS Sync)

1.  **Offline State:** Authentication attempts (Timestamps, UserID, Match Confidence) are appended to a local SQLite `sync_queue` table.
2.  **Internet Detected:** `NetworkSyncManager` wakes up.
3.  **Authentication:** Mobile app hits **AWS API Gateway** with a JWT or IAM role.
4.  **Processing:** **AWS Lambda** validates the batch payload.
5.  **Storage:** 
    *   Logs saved to **DynamoDB**.
    *   If any audit images are needed, they are securely uploaded to **S3** via Presigned URLs.
6.  **Purge Confirmation:** Lambda returns a `200 OK` with synced record IDs. The mobile app triggers DELETE operations on the local `sync_queue` to free up space.

## 6. Mobile Optimization Techniques

*   **INT8 Quantization:** Compress the TFLite models from float32 to int8, reducing size by 4x with minimal accuracy loss.
*   **Frame Resizing & Dropping:** Don't run ML on every single 1080p frame. Resize frames to `112x112` (standard MobileFaceNet input) and run inference on every 3rd or 4th frame.
*   **Bounding Box Cropping:** Only pass the bounding box of the detected face to the recognition model, ignoring the background.
*   **C++ JSI/Worklets:** Use React Native Reanimated worklets and JSI to run frame processing entirely on the UI/Native thread without crossing the React Native JS Bridge.

## 7. Offline Storage Design

Using **SQLite** (`react-native-quick-sqlite` for high performance JSI database access).

*   **Users Table:** `id`, `name`, `employee_id`, `created_at`
*   **Embeddings Table:** `id`, `user_id`, `embedding_blob` (store the 128-d array as binary/BLOB), `version`
*   **AuthLogs Table (Sync Queue):** `id`, `user_id`, `timestamp`, `match_confidence`, `liveness_score`, `sync_status` (0=pending, 1=synced)

## 8. AWS Sync Mechanism

*   Use `NetInfo` to listen for network state.
*   When `isConnected === true`, trigger `SyncWorker`.
*   Fetch `SELECT * FROM AuthLogs WHERE sync_status = 0 LIMIT 50`.
*   Send JSON batch to API Gateway.
*   On success: `DELETE FROM AuthLogs WHERE id IN (...)`.
*   Use AWS Cognito for securing the API Gateway endpoints.

## 9. Liveness Detection Pipeline

Active liveness challenge system to prevent photo/video spoofing:
1.  **Challenge Generation:** Randomly select a sequence (e.g., "Blink then Smile", or "Turn Right").
2.  **Face Mesh Execution:** Feed frames to MediaPipe face mesh.
3.  **EAR (Eye Aspect Ratio):** Calculate distance between vertical eye landmarks. A sudden drop below 0.2 and return to 0.3 indicates a blink.
4.  **MAR (Mouth Aspect Ratio):** Calculate distance between lip landmarks for smiling/open mouth.
5.  **Head Pose (Pitch/Yaw/Roll):** Use PnP (Perspective-n-Point) on nose, eyes, and chin to ensure the user turns their head correctly.

## 10. Face Recognition Pipeline

1.  **Detect Face** -> Get bounding box -> Crop image.
2.  **Align Face** -> Use eye landmarks to rotate/align the face crop (crucial for accuracy).
3.  **Pre-process** -> Normalize image (brightness/CLAHE if needed), resize to 112x112.
4.  **Inference** -> Pass localized face to MobileFaceNet TFLite model.
5.  **Output** -> Returns 128-d float array (embedding vector).
6.  **Matching** -> Compare this embedding to all embeddings in SQLite using **Cosine Similarity**:
    *   `Similarity = (A · B) / (||A|| * ||B||)`
    *   If `Similarity > Threshold (e.g., 0.82)`, identity confirmed.

## 11. Recommended Libraries/Frameworks

*   **Framework:** React Native (TypeScript), React Navigation.
*   **Camera:** `react-native-vision-camera` (V3/V4).
*   **ML:** `react-native-fast-tflite`, `@mediapipe/tasks-vision`.
*   **Database:** `react-native-quick-sqlite` (or WatermelonDB for offline-first sync).
*   **Encryption:** `react-native-mmkv` (Secure storage wrapper), `react-native-crypto`.
*   **Network:** `axios`, `@react-native-community/netinfo`.

## 12. Step-by-Step Implementation Plan

*   **Phase 1: Setup & Cleanup (Day 1)** 
    *   Archive Python code. Initialize React Native project (`npx react-native init MobileFacialAuth`).
    *   Setup native camera permissions and UI.
*   **Phase 2: ML Foundation (Day 2)**
    *   Integrate Vision Camera and test frame processors.
    *   Load ML Kit / MediaPipe for bounding box face detection.
*   **Phase 3: Recognition Engine (Day 3-4)**
    *   Integrate TFLite MobileFaceNet.
    *   Build embedding generation and the Cosine similarity matching function.
*   **Phase 4: Liveness & Security (Day 5)**
    *   Implement Face Mesh and EAR calculations for blink detection.
*   **Phase 5: Offline DB & Registration (Day 6)**
    *   Setup SQLite. Create "Add User" flow capturing 5 angles of user to average embeddings.
*   **Phase 6: AWS Sync (Day 7)**
    *   Setup API Gateway, Lambda, DynamoDB. 
    *   Implement offline sync and purge logic.

## 13. Database Schema

```sql
CREATE TABLE IF NOT EXISTS Users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Biometrics (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    embedding BLOB NOT NULL, -- 128 float values
    FOREIGN KEY(user_id) REFERENCES Users(id)
);

CREATE TABLE IF NOT EXISTS AttendanceLog (
    log_id TEXT PRIMARY KEY,
    user_id TEXT,
    auth_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    confidence REAL,
    liveness_status TEXT,
    sync_status INTEGER DEFAULT 0 -- 0=Pending, 1=Synced
);
```

## 14. API Structure (AWS Lambda / APIGW)

*   `POST /api/v1/sync/logs`
    *   **Payload:** `[{ log_id, user_id, timestamp, confidence }]`
    *   **Response:** `{ synced_records: ["log_id_1"] }`
*   `POST /api/v1/sync/biometrics` (Admin only, pull or push updated centralized faces to edge devices on setup)

## 15. Security Improvements

1.  **Encrypted Local DB:** Use SQLCipher via `react-native-quick-sqlite` to encrypt the entire database file with a securely generated device key.
2.  **No Images Stored:** Never store raw face images on the local disk. Extract embeddings in RAM, immediately discard the image, and store only the BLOB vectors.
3.  **Jailbreak/Root Detection:** Reject installation or wipe data if root/jailbreak is detected.
4.  **Signed Executables:** Enforce strict ProGuard rules and App Signing.

## 16. Performance Optimization Strategies

*   **Fast Math:** Use native C++ routines built into JSI for the Cosine Similarity calculation (JS arrays of 128 floats are slow to iterate in standard JS).
*   **Memory Management:** Strictly release camera buffers inside Frame Processors to avoid RAM ballooning and Out-Of-Memory (OOM) crashes on 3GB RAM devices.
*   **CLAHE Pre-Processing:** For Indian demographics & harsh lighting, apply Contrast Limited Adaptive Histogram Equalization locally using a lightweight openCV-mobile port or a WebGL shader before passing to the ML model.

## 17. Suggested UI Screens

1.  **Splash Screen:** Branding for Hackathon 7.0.
2.  **Enrollment Screen:** Guides user to align face in oval. "Look up", "Look down" (progress ring fills up).
3.  **Auth Screen (Main):** Full screen camera. "Blink to verify". Once verified -> Green Overlay -> "Welcome, Jane Doe (98% Match)".
4.  **Admin / Diagnostics Screen:** Hidden screen showing EAR thresholds, local sync queue count, database size, and "Force Sync" button.

## 18. Technical Documentation Outline

1.  **System Overview & Architecture Diagram**
2.  **On-Device Machine Learning Strategy**
3.  **Liveness Detection Algorithm Mathematics (EAR/MAR details)**
4.  **Offline-first Data Protocol**
5.  **Build & Deployment Guide (Android APK & iOS IPA)**
6.  **Performance Benchmarks (Latency & App Size metrics)**

## 19. PPT Presentation Points

*   **Problem:** Remote areas lack steady internet, preventing cloud-based biometric attendance.
*   **Solution Overview:** A 100% offline Edge-AI solution.
*   **Key Innovation:** True Liveness Detection (blink/smile) without hitting an API + <1s match speed natively.
*   **Architecture Diagram (Visual):** Show the mobile device holding the DB, and the batch sync to AWS.
*   **Privacy & Security:** "No faces are stored. We store mathematical representations encrypted on-device."
*   **Scalability:** AWS Serverless architecture handles massive traffic dumps when devices regain connectivity.

## 20. Deployment Workflow

1.  **Continuous Integration:** GitHub Actions triggering Metro bundler checks.
2.  **Backend Deployment:** AWS CDK toolkit (`cdk deploy`) to spin up API/Lambda/DynamoDB stack.
3.  **Android Build:** `cd android && ./gradlew assembleRelease` -> Output an optimized `.aab` or `.apk`.
4.  **iOS Build:** Xcode Archive -> AdHoc/TestFlight via Fastlane.
5.  **Device Provisioning:** Sideload onto remote devices using an MDM (Mobile Device Management) or manual APK install.
