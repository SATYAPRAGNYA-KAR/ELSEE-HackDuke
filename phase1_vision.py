import cv2
import os
from brain import process_elsee_request # Import your existing logic

def run_pc_sensor():
    # Index 0 is almost always the built-in FaceTime camera on a Mac
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("❌ Error: Could not access the PC Webcam.")
        return

    print("\n--- elsee PHASE 1 ACTIVE ---")
    print("Commands:")
    print(" [SPACE] - Capture scene and ask 'elsee' for help")
    print(" [Q]     - Quit the sensor\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Mirror the frame so it feels natural (like a mirror)
        frame = cv2.flip(frame, 1)

        # Add a "UI" overlay for the hackathon demo
        cv2.putText(frame, "elsee: SENSOR LIVE", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        
        cv2.imshow("elsee Phase 1", frame)

        key = cv2.waitKey(1) & 0xFF

        # --- THE TRIGGER ---
        if key == ord(' '):  # SPACEBAR
            print("📸 Capturing scene...")
            
            # 1. Save the current frame
            img_path = "live_capture.jpg"
            cv2.imwrite(img_path, frame)
            
            # 2. Check for the audio query you made earlier
            aud_path = "query.wav"
            
            if os.path.exists(aud_path):
                # 3. Send to your Brain!
                process_elsee_request(img_path, aud_path)
            else:
                print("⚠️ Missing 'query.wav'! Speak your query into a file first.")

        elif key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_pc_sensor()