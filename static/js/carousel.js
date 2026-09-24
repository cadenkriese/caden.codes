document.querySelectorAll('.carousel-container').forEach((container) => {
  const carousel = container.querySelector('.carousel');
  const slides = Array.from(carousel.children);
  const controls = container.querySelector('.carousel-controls');
  const previous = controls.querySelector('.carousel-previous');
  const next = controls.querySelector('.carousel-next');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  controls.hidden = false;
  update();
});

const lazyVideos = document.querySelectorAll('.carousel video[data-src]');
if (lazyVideos.length) {
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target: video, isIntersecting }) => {
      if (isIntersecting) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.01 });
  lazyVideos.forEach((video) => videoObserver.observe(video));
}
