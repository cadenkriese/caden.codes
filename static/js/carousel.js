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
    const positions = offsets();
    previous.disabled = positions[0] >= -1;
    next.disabled = positions[positions.length - 1] <= 1;
  }

  let animationFrame = null;
  let queuedDirection = 0;

  function stopAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
    queuedDirection = 0;
    carousel.classList.remove('is-animating');
  }

  function advance(direction) {
    // Finish the current easing curve before processing another button press.
    if (animationFrame !== null) {
      queuedDirection = direction;
      return;
    }
    const positions = offsets();
    const current = positions.reduce((nearest, offset, index) =>
      Math.abs(offset) < Math.abs(positions[nearest]) ? index : nearest, 0);
    const target = Math.max(0, Math.min(slides.length - 1, current + direction));
    const distance = positions[target];
    if (reducedMotion.matches || Math.abs(distance) < 1) {
      carousel.scrollBy({ left: distance, behavior: 'instant' });
      update();
      return;
    }

    const start = carousel.scrollLeft;
    const startTime = performance.now();
    const duration = 400;
    carousel.classList.add('is-animating');

    function frame(now) {
      const t = Math.min(1, (now - startTime) / duration);
      // Quintic smoothstep: velocity and acceleration are zero at both ends.
      const eased = t * t * t * (10 + t * (-15 + 6 * t));
      carousel.scrollTo({ left: start + distance * eased, behavior: 'instant' });
      if (t < 1) {
        animationFrame = requestAnimationFrame(frame);
      } else {
        animationFrame = null;
        carousel.classList.remove('is-animating');
        update();
        const queued = queuedDirection;
        queuedDirection = 0;
        if (queued) advance(queued);
      }
    }
    animationFrame = requestAnimationFrame(frame);
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
  // Direct interaction takes control immediately; native snapping resumes.
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((event) => {
    carousel.addEventListener(event, stopAnimation, { passive: true });
  });
  reducedMotion.addEventListener('change', stopAnimation);
  const resizeObserver = new ResizeObserver(() => {
    stopAnimation();
    update();
  });
  resizeObserver.observe(carousel);
  controls.hidden = false;
  update();
});
