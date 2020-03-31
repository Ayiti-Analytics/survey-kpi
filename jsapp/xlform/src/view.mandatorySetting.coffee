_ = require 'underscore'
Backbone = require 'backbone'
$configs = require './model.configs'
$baseView = require './view.pluggedIn.backboneView'
$viewTemplates = require './view.templates'

module.exports = do ->
  class MandatorySettingView extends $baseView
    className: 'mandatory-setting'
    events: {
      'input .js-mandatory-setting-radio': 'onRadioChange'
      'keyup .js-mandatory-setting-custom-text': 'onCustomTextKeyup'
      'blur .js-mandatory-setting-custom-text': 'onCustomTextBlur'
    }

    initialize: ({@model}) ->
      if @model
        @model.on('change', @render, @)
      return

    render: ->
      reqVal = @getChangedValue()
      template = $($viewTemplates.$$render("row.mandatorySettingSelector", "required_#{@model.cid}", reqVal))
      @$el.html(template)
      if reqVal isnt 'true' and reqVal isnt 'false'
        @$el.find('.js-mandatory-setting-custom-text').val(reqVal)
      return @

    insertInDOM: (rowView)->
      @$el.appendTo(rowView.defaultRowDetailParent)
      return

    onRadioChange: (evt) ->
      val = evt.currentTarget.value
      if val is 'custom'
        @setNewValue('')
        @$el.find('.js-mandatory-setting-custom-text').focus()
      else
        @setNewValue(val)
      return

    onCustomTextKeyup: (evt) ->
      if evt.key is 'Enter' or evt.keyCode is 13 or evt.which is 13
        evt.target.blur()
      else
        val = evt.currentTarget.value
        @setNewValue(val)
        @$el.find('.js-mandatory-setting-custom-text').focus()
      return

    onCustomTextBlur: (evt) ->
      val = evt.currentTarget.value
      @setNewValue(val)
      return

    getChangedValue: ->
      val = @model.getValue()
      changedVal = @model.changed?.required?.attributes?.value
      if typeof changedVal isnt 'undefined'
        return String(changedVal)
      return String(val)

    setNewValue: (val) ->
      if @model.get('value') is true or @model.get('value') is false
        if val isnt ''
          @model.set('value', val)
      else
        @model.set('value', val)
      return

  MandatorySettingView: MandatorySettingView
