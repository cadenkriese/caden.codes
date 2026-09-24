document.querySelectorAll('.carousel-container').forEach((container) => {
  const carousel = container.querySelector('.carousel');
  const slides = Array.from(carousel.children);
  const controls = container.querySelector('.carousel-controls');
  const previous = controls.querySelector('.carousel-previous');
  const next = controls.querySelector('.carousel-next');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const videos = container.querySelectorAll('video[data-src]');
  let activeVideo = null;
  let isVisible = false;
  videos.forEach((video) => {
    video.pause();
    video.removeAttribute('autoplay');
    video.removeAttribute('loop');
  });
  if (slides.length < 2) return;

  function offsets() {
    const viewport = carousel.getBoundingClientRect();
    const center = viewport.left + viewport.width / 2;
    return slides.map((slide) => {
      const bounds = slide.getBoundingClientRect();
      return bounds.left + bounds.width / 2 - center;
    });
  }

  function update() {
    const viewport = carousel.getBoundingClientRect();
    const center = viewport.left + viewport.width / 2;
    const first = slides[0].getBoundingClientRect();
    const last = slides[slides.length - 1].getBoundingClientRect();
    previous.disabled = first.left + first.width / 2 - center >= -1;
    next.disabled = last.left + last.width / 2 - center <= 1;
    updateVideo();
  }

  function updateVideo() {
    const positions = offsets();
    const index = positions.reduce((nearest, offset, candidate) =>
      Math.abs(offset) < Math.abs(positions[nearest]) ? candidate : nearest, 0);
    // Load the current and neighboring first frames before they become active.
    for (let neighbor = Math.max(0, index - 1); neighbor <= Math.min(slides.length - 1, index + 1); neighbor++) {
      const nearbyVideo = slides[neighbor].querySelector('video[data-src]');
      if (nearbyVideo && !nearbyVideo.src) {
        nearbyVideo.preload = 'auto';
        nearbyVideo.src = nearbyVideo.dataset.src;
        nearbyVideo.load();
      }
    }
    const video = isVisible && !document.hidden ? slides[index].querySelector('video[data-src]') : null;
    if (video === activeVideo) return;

    if (activeVideo) {
      activeVideo.pause();
      activeVideo.currentTime = 0;
    }
    activeVideo = video;
    if (video) {
      video.play().catch(() => {});
    }
  }

  let targetIndex = null;

  function stopAnimation() {
    if (targetIndex === null) return;
    targetIndex = null;
    carousel.scrollTo({ left: carousel.scrollLeft, behavior: 'instant' });
    update();
  }

  function advance(direction) {
    const positions = offsets();
    const current = targetIndex ?? positions.reduce((nearest, offset, index) =>
      Math.abs(offset) < Math.abs(positions[nearest]) ? index : nearest, 0);
    targetIndex = Math.max(0, Math.min(slides.length - 1, current + direction));
    const distance = positions[targetIndex];
    const instant = reducedMotion.matches || Math.abs(distance) < 1;
    carousel.scrollBy({ left: distance, behavior: instant ? 'instant' : 'smooth' });
    if (instant) {
      targetIndex = null;
      update();
    }
  }

  previous.addEventListener('click', () => advance(-1));
  next.addEventListener('click', () => advance(1));
  let pendingFrame = false;
  carousel.addEventListener('scroll', () => {
    if (pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(() => {
      pendingFrame = false;
      update();
    });
  }, { passive: true });
  carousel.addEventListener('scrollend', () => {
    targetIndex = null;
    update();
  });
  // Direct interaction takes control from button navigation.
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((event) => {
    carousel.addEventListener(event, stopAnimation, { passive: true });
  });
  reducedMotion.addEventListener('change', stopAnimation);
  const resizeObserver = new ResizeObserver(() => {
    stopAnimation();
    update();
  });
  resizeObserver.observe(carousel);
  resizeObserver.observe(slides[0]);
  resizeObserver.observe(slides[slides.length - 1]);
  if (videos.length) {
    const videoObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      updateVideo();
    }, { threshold: 0.01 });
    videoObserver.observe(carousel);
    document.addEventListener('visibilitychange', updateVideo);
  }
  controls.hidden = false;
  update();
});
