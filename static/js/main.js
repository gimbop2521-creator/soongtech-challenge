// 작은 질문에서 시작하는 나만의 AI 습관 - Frontend JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 선택
  const askForm = document.getElementById('ask-form');
  const questionInput = document.getElementById('question-input');
  const submitBtn = document.getElementById('submit-btn');
  const charCount = document.getElementById('char-count');
  const loadingSpinner = document.getElementById('loading-spinner');
  const errorCard = document.getElementById('error-card');
  const errorMessage = document.getElementById('error-message');
  const resultContainer = document.getElementById('result-container');
  const answerContent = document.getElementById('answer-content');
  const tipContent = document.getElementById('tip-content');
  const applyTipBtn = document.getElementById('apply-tip-btn');
  const copyAnswerBtn = document.getElementById('copy-answer-btn');

  // 출석 및 streak 관련 DOM
  const streakBadge = document.getElementById('streak-badge');
  const streakCountText = document.getElementById('streak-count-text');
  const stampContainer = document.getElementById('stamp-container');
  const runnerBadge = document.getElementById('runner-badge');
  const openCertBtn = document.getElementById('open-cert-btn');

  // 수료증 모달 관련 DOM
  const certModal = document.getElementById('cert-modal');
  const certificateCard = document.getElementById('certificate-card');
  const certUserName = document.getElementById('cert-user-name');
  const certDate = document.getElementById('cert-date');
  const btnDownloadCert = document.getElementById('btn-download-cert');
  const btnShareCert = document.getElementById('btn-share-cert');
  const btnCloseCert = document.getElementById('btn-close-cert');

  // 유저 ID 관리
  const toggleUserBtn = document.getElementById('toggle-user-btn');
  const userSettingBox = document.getElementById('user-setting-box');
  const userIdInput = document.getElementById('user-id-input');
  const saveUserBtn = document.getElementById('save-user-btn');
  const displayUserName = document.getElementById('display-user-name');

  // 로컬 스토리지에서 유저 ID 로드
  const savedUserId = localStorage.getItem('soongtech_ai_user_id') || 'student_soong';
  userIdInput.value = savedUserId;
  displayUserName.innerText = savedUserId;

  // 유저 출석 상태 서버에서 불러오기
  loadUserAttendance(savedUserId);

  // 유저 ID 토글 및 저장
  toggleUserBtn.addEventListener('click', () => {
    userSettingBox.classList.toggle('hidden');
  });

  saveUserBtn.addEventListener('click', () => {
    const newId = userIdInput.value.trim() || 'student_soong';
    localStorage.setItem('soongtech_ai_user_id', newId);
    displayUserName.innerText = newId;
    userSettingBox.classList.add('hidden');
    loadUserAttendance(newId);
  });

  // 글자 수 실시간 카운트
  questionInput.addEventListener('input', () => {
    const currentLength = questionInput.value.length;
    charCount.textContent = `${currentLength} / 300자`;
  });

  // 추천 예시 칩 클릭 이벤트
  document.querySelectorAll('.sample-chip').forEach(button => {
    button.addEventListener('click', () => {
      const rawText = button.textContent.trim();
      const cleanText = rawText.replace(/^[^\w가-힣]+/, '').trim();
      questionInput.value = cleanText;
      questionInput.focus();
      charCount.textContent = `${questionInput.value.length} / 300자`;
    });
  });

  // 팁으로 질문하기 버튼 클릭
  applyTipBtn.addEventListener('click', () => {
    const tipText = tipContent.textContent.trim();
    if (tipText) {
      questionInput.value = `방금 주신 팁("${tipText}")을 참고해서 더 구체적인 예시나 실천 방법을 알려주세요!`;
      questionInput.focus();
      charCount.textContent = `${questionInput.value.length} / 300자`;
      askForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // 답변 복사 버튼
  copyAnswerBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(answerContent.innerText);
      const originalText = copyAnswerBtn.innerHTML;
      copyAnswerBtn.innerHTML = '✨ 복사 완료!';
      setTimeout(() => {
        copyAnswerBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      alert('복사에 실패했습니다.');
    }
  });

  // 질문 폼 전송 핸들러
  askForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = questionInput.value.trim();
    const userId = userIdInput.value.trim() || 'student_soong';

    if (!question) {
      alert('질문 내용을 입력해주세요!');
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          user_question: question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || '답변을 생성하는 도중 오류가 발생했습니다.');
      }

      // 결과 렌더링
      answerContent.innerText = data.answer;
      tipContent.innerText = data.deep_dive_tip;

      // 출석 및 연속 출석 도장 실시간 업데이트
      updateStreakUI(data.streak_count, data.attended_today, data.is_first_today);

      // 결과 카드 보이기 및 스크롤
      resultContainer.classList.remove('hidden');
      errorCard.classList.add('hidden');

      setTimeout(() => {
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

      // 5일차 완주 달성 시 축하 모달 오픈!
      if (data.streak_count >= 5 && data.is_first_today) {
        setTimeout(() => {
          openCertificateModal();
        }, 800);
      }

    } catch (err) {
      console.error('API Error:', err);
      errorMessage.innerText = err.message || '서버와의 통신에 실패했습니다. 백엔드 서버 상태를 확인해주세요.';
      errorCard.classList.remove('hidden');
      resultContainer.classList.add('hidden');
    } finally {
      setLoadingState(false);
    }
  });

  // 서버에서 유저 출석 정보 불러오기
  async function loadUserAttendance(userId) {
    try {
      const res = await fetch(`/api/user/${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        updateStreakUI(data.streak_count, data.attended_today, false);
      }
    } catch (err) {
      console.warn('출석 정보 로드 실패:', err);
      updateStreakUI(1, false, false);
    }
  }

  // 실시간 출석 스티커/뱃지 및 5일 도장 UI 렌더링
  function updateStreakUI(streakCount, attendedToday, isFirstToday) {
    // 1. 상단 출석 스티커 / 뱃지 텍스트 갱신
    if (streakCount > 0) {
      streakCountText.innerText = `연속 ${streakCount}일째 AI 습관 형성 중!`;
      if (streakCount >= 5) {
        runnerBadge.innerText = '습관 마스터 🏆';
        runnerBadge.className = 'text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold border border-purple-200/60';
        openCertBtn.classList.remove('hidden');
      } else if (streakCount >= 3) {
        runnerBadge.innerText = '열정 러너 🔥';
        runnerBadge.className = 'text-[11px] px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 font-semibold border border-orange-200/60';
        openCertBtn.classList.add('hidden');
      } else {
        runnerBadge.innerText = 'AI 러너 🌱';
        runnerBadge.className = 'text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium border border-amber-200/60';
        openCertBtn.classList.add('hidden');
      }
    } else {
      streakCountText.innerText = '첫 질문으로 1일차 도장을 찍어보세요!';
      runnerBadge.innerText = '새싹 러너 🌱';
      openCertBtn.classList.add('hidden');
    }

    // 오늘 첫 질문 달성 시 스티커 축하 애니메이션
    if (isFirstToday) {
      streakBadge.classList.add('scale-105', 'ring-2', 'ring-orange-400');
      setTimeout(() => {
        streakBadge.classList.remove('scale-105', 'ring-2', 'ring-orange-400');
      }, 1500);
    }

    // 2. 5일 챌린지 도장판 렌더링
    stampContainer.innerHTML = '';
    const totalDays = 5;

    for (let day = 1; day <= totalDays; day++) {
      const stampBox = document.createElement('div');
      stampBox.className = 'flex flex-col items-center py-2 px-1 rounded-xl transition-all duration-300';

      if (day <= streakCount) {
        stampBox.className += ' bg-blue-50/90 border border-blue-200/70 shadow-xs';
        stampBox.innerHTML = `
          <span class="text-[10px] text-blue-600 font-bold">${day}일차</span>
          <span class="text-base mt-0.5">✅</span>
        `;
      } else if (day === streakCount + 1 && !attendedToday) {
        stampBox.className += ' bg-indigo-50 border border-indigo-300 ring-2 ring-indigo-400/40 shadow-sm';
        stampBox.innerHTML = `
          <span class="text-[10px] text-indigo-700 font-bold">오늘</span>
          <span class="text-base mt-0.5 animate-pulse">🎯</span>
        `;
      } else {
        stampBox.className += ' bg-slate-50 border border-slate-200/60 opacity-50';
        stampBox.innerHTML = `
          <span class="text-[10px] text-slate-400 font-medium">${day}일차</span>
          <span class="text-base mt-0.5">🔒</span>
        `;
      }

      stampContainer.appendChild(stampBox);
    }
  }

  // --- 🏆 수료증 모달 & 폭죽(Confetti) 로직 ---

  // 폭죽 팡파레 효과 함수
  function triggerCelebrationConfetti() {
    if (typeof confetti === 'function') {
      const duration = 2.5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          return clearInterval(interval);
        }
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    }
  }

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  // 수료증 모달 열기
  function openCertificateModal() {
    const userId = userIdInput.value.trim() || 'student_soong';
    certUserName.innerText = userId;
    const now = new Date();
    certDate.innerText = `${now.getFullYear()}. ${String(now.getMonth() + 1).padStart(2, '0')}. ${String(now.getDate()).padStart(2, '0')}`;
    certModal.classList.remove('hidden');
    triggerCelebrationConfetti();
  }

  // 수료증 모달 닫기
  function closeCertificateModal() {
    certModal.classList.add('hidden');
  }

  // 이벤트 연결
  openCertBtn?.addEventListener('click', openCertificateModal);
  btnCloseCert?.addEventListener('click', closeCertificateModal);
  certModal?.addEventListener('click', (e) => {
    if (e.target === certModal) closeCertificateModal();
  });

  // 수료증 PNG 이미지 다운로드 (html2canvas 활용)
  btnDownloadCert?.addEventListener('click', async () => {
    if (typeof html2canvas !== 'function') {
      alert('이미지 캡처 라이브러리가 로드되지 않았습니다.');
      return;
    }

    try {
      const originalText = btnDownloadCert.innerHTML;
      btnDownloadCert.innerHTML = '<span>⏳</span><span>수료증 생성 중...</span>';
      btnDownloadCert.disabled = true;

      const canvas = await html2canvas(certificateCard, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: null,
      });

      const imageURL = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = imageURL;
      const userName = userIdInput.value.trim() || 'student';
      downloadLink.download = `숭테크_AI습관챌린지_수료증_${userName}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      btnDownloadCert.innerHTML = '<span>✅</span><span>다운로드 완료!</span>';
      setTimeout(() => {
        btnDownloadCert.innerHTML = originalText;
        btnDownloadCert.disabled = false;
      }, 2000);

    } catch (err) {
      console.error('수료증 이미지 저장 오류:', err);
      alert('수료증 이미지 생성 중 오류가 발생했습니다.');
      btnDownloadCert.innerHTML = '<span>📸</span><span>수료증 이미지 저장 (PNG)</span>';
      btnDownloadCert.disabled = false;
    }
  });

  // SNS 자랑하기 / 클립보드 공유
  btnShareCert?.addEventListener('click', async () => {
    const userName = userIdInput.value.trim() || '숭실이';
    const shareText = `🎉 [숭테크 AI 습관 형성 5일 챌린지] ${userName} 학생이 5일 연속 출석과 AI 질문 챌린지를 완주하여 수료증을 획득했습니다! 🏆✨ #숭테크 #AI습관 #AI챌린지`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: '숭테크 AI 습관 형성 5일 챌린지 완주 수료증',
          text: shareText,
          url: window.location.href,
        });
      } catch (e) {
        // 취소 시 무시
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert('✨ 인스타/SNS에 공유할 수 있는 축하 문구가 클립보드에 복사되었습니다!\n스토리나 피드에 붙여넣어 자랑해 보세요 👏');
      } catch (err) {
        alert(shareText);
      }
    }
  });

  // 로딩 상태 헬퍼 함수
  function setLoadingState(isLoading) {
    if (isLoading) {
      loadingSpinner.classList.remove('hidden');
      errorCard.classList.add('hidden');
      resultContainer.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>AI 습관 튜터가 생각 중입니다...</span>
      `;
    } else {
      loadingSpinner.classList.add('hidden');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
        <span>질문하고 AI 습관 만들기</span>
      `;
    }
  }
});
