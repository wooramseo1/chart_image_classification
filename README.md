# Chart Strategy Agent

투자 차트 분석 대응을 위한 AI 기반 자동 차트 이미지 분석 시스템

주식 차트 이미지를 업로드하면 사전 학습된 이미지 분류 모델이 차트 형태를 **Trend Line(추세선)** 과 **Triangle Pattern(삼각수렴)** 으로 판별하고, 판별 결과를 바탕으로 진입·손절·목표 전략을 제시하는 웹사이트입니다.

**사이트 바로가기:** https://wooramseo1.github.io/chart_image_classification/ (GitHub Pages 활성화 후 접속 가능)

## 주요 기능

- **차트 이미지 업로드** — 드래그 앤 드롭, 파일 선택, 클립보드 붙여넣기(Ctrl+V) 지원
- **AI 패턴 분류** — Teachable Machine으로 학습한 모델이 클래스별 확률을 계산
- **전략 자동 결정** — 판별 결과, 신뢰도, 추세 방향, 투자 성향을 종합해 전략 리포트 생성
- **신뢰도 시각화** — 신뢰도 게이지와 클래스별 확률 막대 표시
- **분석 기록** — 최근 12건의 분석 결과를 썸네일과 함께 브라우저에 저장
- **프라이버시** — 모든 추론은 브라우저(TensorFlow.js)에서 실행되며 이미지는 서버로 전송되지 않음

## 사이트 구성

| 메뉴 | 내용 |
| --- | --- |
| 홈 | 서비스 소개, 데모 차트 |
| 주요 기능 | 6가지 핵심 기능 소개 |
| 차트 분석 | 이미지 업로드 → 옵션 선택 → AI 분석 → 전략 리포트 |
| 전략 가이드 | 패턴별 설명과 전략 판단 규칙 |
| 작동 원리 | 4단계 처리 과정과 사용 기술 |
| 분석 기록 | 최근 분석 결과 목록 |

## 전략 판단 규칙

| 조건 | 판단 | 액션 |
| --- | --- | --- |
| 최고 확률 < 신뢰도 기준 | 패턴 신호 불명확 | `HOLD` 관망 |
| Trend Line · 상승 또는 방향 모름 | 추세 지속 가능성 | `BUY` 추세 추종 매수 |
| Trend Line · 하락 | 하락 추세 지속 | `REDUCE` 비중 축소 |
| Triangle Pattern | 변동성 수렴, 돌파 임박 | `WAIT` 돌파 대기 |

- 신뢰도 기준은 50~95% 범위에서 조절할 수 있습니다(기본 70%).
- 리스크 등급(1~5)은 투자 성향(보수적/중립/공격적), 신뢰도, 두 클래스 확률 차이에 따라 조정됩니다.

## 실행 방법

정적 파일로만 구성되어 있어 별도 빌드가 필요 없습니다.

```bash
git clone https://github.com/wooramseo1/chart_image_classification.git
cd chart_image_classification
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 에 접속합니다. 모델은 인터넷에서 불러오므로 네트워크 연결이 필요합니다.

### GitHub Pages 배포

저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 지정하면 배포됩니다.

## 파일 구성

```
├── index.html   # 페이지 구조와 메뉴
├── style.css    # 디자인, 반응형 레이아웃
├── app.js       # 모델 로드, 예측, 전략 결정 규칙, 분석 기록
└── ads.txt      # Google AdSense 판매자 인증
```

## 모델

- 학습 도구: [Google Teachable Machine](https://teachablemachine.withgoogle.com/) (이미지 프로젝트)
- 모델 주소: https://teachablemachine.withgoogle.com/models/5OHUfHQ4G/
- 클래스: `trendline`, `Pattern_Triangle`
- 입력 크기: 224 × 224
- 라이브러리: `@tensorflow/tfjs@1.3.1`, `@teachablemachine/image@0.8.5`

다른 모델로 바꾸려면 `app.js`의 `MODEL_URL`을 수정하세요. 클래스 이름에 `trend` 또는 `triangle`이 포함되어 있으면 전략 규칙이 그대로 적용됩니다.

## 면책 조항

본 서비스는 교육·연구 목적의 보조 도구입니다. 분석 결과는 차트 이미지 형태에 기반한 참고 정보이며 투자 권유가 아닙니다. 최종 투자 판단과 책임은 사용자에게 있습니다.
