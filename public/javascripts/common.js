$("#selectRepo").change(function() {
  Cookies.set('selectedRepository', this.value);
  window.open($(location).attr('pathname'), '_self');
});