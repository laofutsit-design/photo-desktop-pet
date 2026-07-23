"use strict";

document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", () => {
  const renderIcons = () => {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  };

  renderIcons();

  const header = document.querySelector("[data-header]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-nav]");

  const updateHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  const closeMenu = () => {
    if (!menuToggle || !nav) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "打开导航");
    menuToggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
    nav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    renderIcons();
  };

  menuToggle?.addEventListener("click", () => {
    if (!nav) return;
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "打开导航" : "关闭导航");
    menuToggle.innerHTML = `<i data-lucide="${isOpen ? "menu" : "x"}" aria-hidden="true"></i>`;
    nav.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
    renderIcons();
  });

  nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  const revealItems = document.querySelectorAll(".reveal:not(.is-visible)");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8%" });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const galleryPanels = Array.from(document.querySelectorAll("[data-gallery-category]"));
  const filterButtons = Array.from(document.querySelectorAll("[data-gallery-filter]"));
  const galleryCounter = document.querySelector("[data-gallery-counter]");
  const galleryOrder = galleryPanels.map((panel) => panel.dataset.galleryCategory);
  let activeGalleryIndex = 0;

  const updateGallery = (category, options = {}) => {
    const { showAll = false, moveIntoView = false } = options;
    const nextIndex = galleryOrder.indexOf(category);
    if (nextIndex >= 0) activeGalleryIndex = nextIndex;

    galleryPanels.forEach((panel, index) => {
      const isActive = index === activeGalleryIndex;
      panel.classList.toggle("is-spotlight", isActive);
      panel.classList.toggle("is-muted", !showAll && !isActive);
    });

    filterButtons.forEach((button) => {
      const target = button.dataset.galleryFilter;
      const isActive = showAll ? target === "all" : target === galleryOrder[activeGalleryIndex];
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (galleryCounter) {
      galleryCounter.value = `${String(activeGalleryIndex + 1).padStart(2, "0")} / ${String(galleryOrder.length).padStart(2, "0")}`;
      galleryCounter.textContent = galleryCounter.value;
    }

    if (moveIntoView) {
      galleryPanels[activeGalleryIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
      galleryPanels[activeGalleryIndex]?.focus({ preventScroll: true });
    }
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.galleryFilter;
      updateGallery(category === "all" ? galleryOrder[0] : category, {
        showAll: category === "all",
        moveIntoView: category !== "all",
      });
    });
  });

  document.querySelectorAll("[data-gallery-next]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextIndex = (activeGalleryIndex + 1) % galleryOrder.length;
      updateGallery(galleryOrder[nextIndex], { moveIntoView: true });
    });
  });

  document.querySelector("[data-gallery-prev]")?.addEventListener("click", () => {
    const nextIndex = (activeGalleryIndex - 1 + galleryOrder.length) % galleryOrder.length;
    updateGallery(galleryOrder[nextIndex], { moveIntoView: true });
  });

  updateGallery(galleryOrder[0], { showAll: true });

  const gifToggle = document.querySelector("[data-gif-toggle]");
  const gifPreview = document.querySelector("[data-gif-preview]");
  let gifPlaying = true;

  gifToggle?.addEventListener("click", () => {
    if (!gifPreview) return;
    gifPlaying = !gifPlaying;
    gifPreview.src = gifPlaying ? "assets/showcase-cat.gif" : "assets/showcase-cat-still.png";
    gifToggle.setAttribute("aria-pressed", String(gifPlaying));
    gifToggle.innerHTML = `<i data-lucide="${gifPlaying ? "pause" : "play"}" aria-hidden="true"></i><span>${gifPlaying ? "暂停 GIF" : "播放 GIF"}</span>`;
    renderIcons();
  });

  const pet = document.querySelector("[data-draggable-pet]");
  const stage = document.querySelector("[data-hero-stage]");
  if (pet && stage) {
    let dragX = 0;
    let dragY = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let startDragX = 0;
    let startDragY = 0;
    let petStartRect;
    let stageRect;

    const applyPosition = () => {
      pet.style.setProperty("--drag-x", `${dragX}px`);
      pet.style.setProperty("--drag-y", `${dragY}px`);
    };

    pet.addEventListener("pointerdown", (event) => {
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      startDragX = dragX;
      startDragY = dragY;
      petStartRect = pet.getBoundingClientRect();
      stageRect = stage.getBoundingClientRect();
      pet.setPointerCapture(event.pointerId);
      pet.classList.add("is-dragging");
    });

    pet.addEventListener("pointermove", (event) => {
      if (!pet.hasPointerCapture(event.pointerId) || !petStartRect || !stageRect) return;
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      const minX = stageRect.left - petStartRect.left;
      const maxX = stageRect.right - petStartRect.right;
      const minY = stageRect.top - petStartRect.top;
      const maxY = stageRect.bottom - petStartRect.bottom;
      dragX = startDragX + Math.min(maxX, Math.max(minX, deltaX));
      dragY = startDragY + Math.min(maxY, Math.max(minY, deltaY));
      applyPosition();
    });

    const stopDragging = (event) => {
      if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
      pet.classList.remove("is-dragging");
    };

    pet.addEventListener("pointerup", stopDragging);
    pet.addEventListener("pointercancel", stopDragging);

    pet.addEventListener("keydown", (event) => {
      const keyMoves = {
        ArrowLeft: [-12, 0],
        ArrowRight: [12, 0],
        ArrowUp: [0, -12],
        ArrowDown: [0, 12],
      };
      const move = keyMoves[event.key];
      if (!move) return;
      event.preventDefault();
      const currentPetRect = pet.getBoundingClientRect();
      const currentStageRect = stage.getBoundingClientRect();
      const nextLeft = currentPetRect.left + move[0];
      const nextRight = currentPetRect.right + move[0];
      const nextTop = currentPetRect.top + move[1];
      const nextBottom = currentPetRect.bottom + move[1];
      if (nextLeft >= currentStageRect.left && nextRight <= currentStageRect.right) dragX += move[0];
      if (nextTop >= currentStageRect.top && nextBottom <= currentStageRect.bottom) dragY += move[1];
      applyPosition();
    });
  }
});
