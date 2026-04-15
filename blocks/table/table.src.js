function normalizeKey(value = '') {
  return value.trim().toLowerCase();
}

function moveCellContent(source, target) {
  while (source.firstChild) {
    target.append(source.firstChild);
  }
}

function createCell(tagName, sourceCell, scope) {
  const cell = document.createElement(tagName);
  if (scope) {
    cell.scope = scope;
  }
  moveCellContent(sourceCell, cell);
  return cell;
}

function readConfigRows(rows) {
  const config = {};
  let dataStartIndex = 0;

  const configFields = {
    caption: 'caption',
    'file header': 'fileHeader',
    'minify header': 'minifyHeader',
    'main header': 'mainHeader',
    'delta header': 'deltaHeader',
  };

  while (dataStartIndex < rows.length) {
    const cells = rows[dataStartIndex];
    if (cells.length !== 2) {
      break;
    }

    const key = normalizeKey(cells[0].textContent);
    const fieldName = configFields[key];
    if (!fieldName) {
      break;
    }

    config[fieldName] = cells[1].textContent.trim();
    dataStartIndex += 1;
  }

  return { config, dataStartIndex };
}

function buildHeaderRow(headers) {
  const row = document.createElement('tr');
  headers.forEach((header, index) => {
    row.append(createCell('th', header, index === 0 ? 'col' : 'col'));
  });
  return row;
}

function buildBodyRows(rows) {
  return rows.map((rowCells) => {
    const row = document.createElement('tr');
    rowCells.forEach((cell, index) => {
      row.append(createCell(index === 0 ? 'th' : 'td', cell, index === 0 ? 'row' : ''));
    });
    return row;
  });
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')]
    .map((row) => [...row.children])
    .filter((cells) => cells.length);

  if (!rows.length) {
    block.remove();
    return;
  }

  const { config, dataStartIndex } = readConfigRows(rows);
  const dataRows = rows.slice(dataStartIndex);

  if (!dataRows.length) {
    block.remove();
    return;
  }

  const table = document.createElement('table');

  if (config.caption) {
    const caption = document.createElement('caption');
    caption.textContent = config.caption;
    table.append(caption);
  }

  const explicitHeaders = [
    config.fileHeader,
    config.minifyHeader,
    config.mainHeader,
    config.deltaHeader,
  ].filter(Boolean);

  let headerCells = null;
  let bodySourceRows = dataRows;

  if (explicitHeaders.length === 4 && dataRows.every((row) => row.length === 4)) {
    headerCells = explicitHeaders.map((headerText) => {
      const cell = document.createElement('div');
      cell.textContent = headerText;
      return cell;
    });
  } else if (dataRows.length > 1) {
    [headerCells] = dataRows;
    bodySourceRows = dataRows.slice(1);
  }

  if (headerCells) {
    const thead = document.createElement('thead');
    thead.append(buildHeaderRow(headerCells));
    table.append(thead);
  }

  const tbody = document.createElement('tbody');
  buildBodyRows(bodySourceRows).forEach((row) => tbody.append(row));
  table.append(tbody);

  const scroller = document.createElement('div');
  scroller.className = 'table-scroll';
  scroller.append(table);

  block.replaceChildren(scroller);
}
