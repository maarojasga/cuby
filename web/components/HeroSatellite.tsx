"use client";

// Satélite holográfico wireframe para el home — adaptación del modelo del
// equipo (cuerpo + paneles + parabólica + antena + campo de estrellas) al
// stack del proyecto: three por npm, ciclo de vida React, sin CDN.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const HOLO = 0x00c2e4;

export default function HeroSatellite() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(4, 2.5, 4.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // En el home el scroll y los botones mandan: solo rotación por arrastre.
    controls.enableZoom = false;
    controls.enablePan = false;
    // El satélite vive en la mitad superior del encuadre, como en el arte.
    controls.target.set(0, -1.35, 0);

    const hologram = new THREE.MeshBasicMaterial({
      color: HOLO,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });

    const sat = new THREE.Group();

    // Cuerpo principal
    sat.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4), hologram));

    // Paneles solares + conectores
    const panelGeo = new THREE.BoxGeometry(2.8, 1.1, 0.04, 6, 3, 1);
    const connGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(panelGeo, hologram);
      panel.position.set(2.2 * side, 0, 0);
      sat.add(panel);
      const conn = new THREE.Mesh(connGeo, hologram);
      conn.rotation.z = Math.PI / 2;
      conn.position.set(1.1 * side, 0, 0);
      sat.add(conn);
    }

    // Antena parabólica + alimentador
    const dish = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 0.35, 16, 4, true),
      hologram
    );
    dish.rotation.x = -Math.PI / 2;
    dish.position.set(0, -0.1, 1.0);
    sat.add(dish);
    const feed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8),
      hologram
    );
    feed.rotation.x = Math.PI / 2;
    feed.position.set(0, -0.1, 1.1);
    sat.add(feed);

    // Antena superior + punta
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8),
      hologram
    );
    antenna.position.set(0, 1.2, 0);
    sat.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hologram);
    tip.position.set(0, 1.7, 0);
    sat.add(tip);

    scene.add(sat);

    // Campo de estrellas en el mismo tono
    const starsGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(800 * 3);
    for (let i = 0; i < starPos.length; i++) {
      starPos[i] = (Math.random() - 0.5) * 50;
    }
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        color: HOLO,
        size: 0.03,
        transparent: true,
        opacity: 0.5,
      })
    );
    scene.add(stars);

    let raf = 0;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      sat.rotation.y += 0.0015;
      sat.rotation.x += 0.0005;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      starsGeo.dispose();
      hologram.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 cursor-grab" />;
}
