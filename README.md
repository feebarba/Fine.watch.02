# Weight Clock

Relógio tipográfico experimental em p5.js, com três anéis para horas, minutos e segundos.

## Abrir no Visual Studio Code

1. Descompacte o arquivo do projeto.
2. Abra a pasta no Visual Studio Code.
3. Abra `index.html` com uma extensão como Live Server.

O projeto não precisa de instalação de pacotes: p5.js e a fonte SN Pro são carregados por CDN.

## Usar dentro de um iframe

O iframe continua reagindo ao mouse dentro da própria área. Para que o relógio também reaja ao ponteiro em todo o site hospedeiro, envie a posição do ponteiro para o iframe:

```js
const clockFrame = document.querySelector("iframe");

function sendPointer(event) {
  const frameRect = clockFrame.getBoundingClientRect();

  clockFrame.contentWindow.postMessage(
    {
      type: "weight-clock:pointermove",
      x: event.clientX - frameRect.left,
      y: event.clientY - frameRect.top,
      viewportWidth: frameRect.width,
      viewportHeight: frameRect.height,
    },
    "*",
  );
}

window.addEventListener("pointermove", sendPointer, { passive: true });
```

O projeto já define `touch-action: pan-y` para preservar a rolagem vertical.
