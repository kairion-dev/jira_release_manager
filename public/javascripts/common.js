(function() {
  var previous;

  $("#selectRepo")
    .on('focus', function() {
      previous = this.value;
    })
    .change(function() {
      let next = this.value;
      Cookies.set('selectedRepository', next);

      // hacky solution, but just works fine for the moment
      var path = $(location).attr('pathname');
      var target = path.replace(new RegExp('/' + previous, 'g'), '/' + next);
      window.open(target, '_self');
    });

})();

$(function() {
  $('#datetimepicker').datetimepicker({
    locale: 'de'
  });
});

$(function() {
  $('[data-tootle="tooltip"]').tooltip();
});