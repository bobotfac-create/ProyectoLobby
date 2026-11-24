# Analisis de formulario Camara

Fuente: DOM capturado manualmente en 2026-09-01 desde
`https://www.camara.cl/transparencia/FormularioSolicitudAudiencia.aspx`.

## Restricciones

- Formulario: `#ff`.
- El panel ASP.NET `#ContentPlaceHolder1_ContentPlaceHolder1_UpdatePanel3`
  reemplaza campos tras postbacks.
- No pulsar `#ContentPlaceHolder1_ContentPlaceHolder1_BtnAgregarAsistentes` ni
  `#ContentPlaceHolder1_ContentPlaceHolder1_btnEnviar`.
- No manipular `.g-recaptcha`.

## Selectores relevantes

- Tipo solicitante: `#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipoSolicitante`.
- Tipo representado: `#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipo`.
- Naturaleza representacion: `#ContentPlaceHolder1_ContentPlaceHolder1_ddlTipoRep`.
- Materia y decision: `#ContentPlaceHolder1_ContentPlaceHolder1_txtMateria` y
  `#ContentPlaceHolder1_ContentPlaceHolder1_txtDecision`.
- Politicas: `#ContentPlaceHolder1_ContentPlaceHolder1_chkPoliticasDatos`.
- Asistente: `#ContentPlaceHolder1_ContentPlaceHolder1_BtnAgregarAsistentes`.

El adaptador maneja personas naturales chilenas/extranjeras, personas juridicas
con RUT, codigo o sin RUT y entidades con RUT o codigo. Para region/comuna,
seleccionar la region antes de la comuna porque el sitio realiza un postback.
