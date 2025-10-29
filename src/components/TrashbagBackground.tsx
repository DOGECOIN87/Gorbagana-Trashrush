import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface TrashbagBackgroundProps {
  className?: string;
}

export const TrashbagBackground: React.FC<TrashbagBackgroundProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationIdRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    
    // Simple initialization without complex retry logic
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    console.log('TrashbagBackground initializing with dimensions:', width, height);
    
    // Scene setup
    const scene = new THREE.Scene();
    
    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true 
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0xff0000, 0.3); // Semi-transparent red background for testing
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '5';
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Create a simple bright cube for testing
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, // Bright green
      wireframe: false
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add another cube for more visibility
    const geometry2 = new THREE.BoxGeometry(1, 1, 1);
    const material2 = new THREE.MeshBasicMaterial({ 
      color: 0x0000ff // Bright blue
    });
    const cube2 = new THREE.Mesh(geometry2, material2);
    cube2.position.set(3, 0, 0);
    scene.add(cube2);

    // Simple animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      // Rotate the cubes
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      
      cube2.rotation.x -= 0.01;
      cube2.rotation.y -= 0.01;
      
      renderer.render(scene, camera);
    };

    console.log('Starting Three.js animation');
    animate();

    // Cleanup function
    return () => {
      console.log('Cleaning up Three.js');
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      
      // Dispose resources
      geometry.dispose();
      material.dispose();
      geometry2.dispose();
      material2.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className={`absolute inset-0 ${className}`}
      style={{ 
        zIndex: 1,
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        backgroundColor: 'rgba(255, 255, 0, 0.5)' // Strong yellow tint for container visibility
      }}
    />
  );
};