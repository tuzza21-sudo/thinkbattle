# 사석 안드로이드 앱

Capacitor 8로 만든 안드로이드 앱이다. 설정은 `capacitor.config.ts`, 네이티브 프로젝트는 `android/`에 있다.

## 동작 방식 (1단계)

- 앱은 `https://saseok.kr`을 연다. 웹을 배포하면 앱에도 바로 반영되고, 서버 API·로그인·출처 검사는 웹과 똑같이 동작한다.
- 앱은 user agent에 `SaseokApp/1`을 붙인다.
  - 페이지: `src/lib/nativeApp.ts`의 `isSaseokApp()`으로 앱인지 안다.
  - 서버: `api/lounge.ts`의 `isSaseokAppRequest()`로 앱인지 안다.
- 앱에서는 성인 모드가 항상 꺼진다(스토어 정책).
- 앱의 요금제 화면에는 구매 버튼이 없다. 인앱결제는 2단계에서 붙인다.
- 로그인(Supabase, 카카오)과 이니시스 결제창 주소는 앱 안에서 열리고, 나머지 외부 주소는 휴대폰 브라우저로 열린다(`allowNavigation`).

## 처음 한 번: 개발 환경

1. [Android Studio](https://developer.android.com/studio)를 설치한다. JDK와 Android SDK가 함께 설치된다.
2. Android Studio를 처음 실행할 때 기본 SDK 설치(Standard)를 끝까지 진행한다.
3. **JDK 21을 준비한다.** Android Studio에 들어 있는 JDK 25로는 Gradle 8.14가 돌지 않는다("Unsupported class file major version 69").
   - `android/gradle/gradle-daemon-jvm.properties`가 Gradle을 JDK 21로 돌리게 하고, Gradle은 `~/.jdks`에 있는 JDK 21을 찾아 쓴다.
   - Android Studio에서는 Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK에서 21을 고르거나 Download JDK → 21로 받는다.
   - 명령줄 빌드: `cd android && JAVA_HOME=~/.jdks/jdk-21.0.13+9 ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`
4. `android/local.properties`에 `sdk.dir=C:/Users/<사용자>/AppData/Local/Android/Sdk`가 있어야 한다. Android Studio로 열면 자동으로 만들어지고, 저장소에는 올라가지 않는다.
5. 에뮬레이터를 쓰려면 SDK Manager → SDK Tools → **Android Emulator hypervisor driver**를 설치해야 한다(관리자 권한, BIOS의 가상화 VT-x가 켜져 있어야 함). 없으면 "x86_64 emulation currently requires hardware acceleration" 오류가 난다.

## 빌드와 실행

```bash
npm run android:sync   # 웹 빌드 후 android/로 복사
npm run android:open   # Android Studio로 열기
```

Android Studio에서 할 일:

- **실행**: 휴대폰을 USB로 연결(개발자 옵션 → USB 디버깅)하거나 에뮬레이터를 고르고 ▶ Run을 누른다.
- **스토어 업로드 파일**: Build → Generate Signed App Bundle → Android App Bundle(.aab)로 만든다.
  - 처음 만드는 서명 키(.jks)와 비밀번호는 저장소 밖에 안전하게 보관한다.
  - 키를 잃으면 같은 앱으로 업데이트를 올릴 수 없다.
  - `*.jks`, `*.keystore`, `keystore.properties`는 `android/.gitignore`에 들어 있다.

## 다음 단계

- [ ] 앱 아이콘과 스플래시 (지금은 Capacitor 기본값)
- [ ] 푸시 알림 (@capacitor/push-notifications + Firebase `google-services.json`)
- [ ] 구글 로그인: 구글은 앱 내부 웹뷰 로그인을 막는다. 시스템 브라우저 + 딥링크로 바꿔야 한다. 카카오는 지금 방식으로 동작한다.
- [ ] 화면을 꺼도 통화가 이어지게 (포그라운드 서비스)
- [ ] AI 답변 신고 기능, 앱 안 계정 삭제 (스토어 요건)
- [ ] Google Play Console 등록, 비공개 테스트
